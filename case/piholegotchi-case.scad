// Piholegotchi case
// Raspberry Pi Zero W + Waveshare 2.13" e-Paper HAT (V4) + UPS-Lite V1.2 battery board
// Parametric OpenSCAD. Export a part with:
//   openscad -D 'part="front"' -o front.stl piholegotchi-case.scad
// Parts: "front" (bezel shell), "back" (back plate), "stand" (angled desk cradle),
//        "testfit" (front face only, a 10-minute print to check the window), "assembly" (preview)
// All sizes in mm. If a measurement of your stack differs, change it in "Your hardware".

part = "assembly";

/* [Your hardware] */
pcb_l = 65;            // board length (Pi Zero, HAT and UPS-Lite all share it)
pcb_w = 30.2;          // board width
pcb_t = 1.6;
hole_inset = 3.5;      // M2.5 hole centres from the board edges (58 x 23 pattern)
panel_t = 1.2;         // e-paper glass on top of the HAT
hat_gap = 8.5;         // HAT underside to Pi top (GPIO header height)
ups_gap = 10.0;        // Pi underside to UPS-Lite board (its black standoffs, battery lives here)

panel_l = 59.2;        // e-paper glass outline
panel_w = 29.2;
aa_l = 48.55;          // visible (active) area
aa_w = 23.71;
aa_off_x = 2.6;        // active area centre offset from the board centre, along the length
aa_off_y = 0.0;        //   (+x = towards the UPS switch end). Check with the testfit print.

/* [Case] */
wall = 2.0;
front_t = 2.0;         // front face thickness
back_t = 3.0;          // back plate thickness
clr = 0.6;             // clearance around the boards
radius = 5;            // outer corner radius
window_margin = 0.5;   // extra around the active area
window_chamfer = 1.2;  // bevel on the window edge
snap = 0.45;           // snap bump height on the back plate edge (raise for a tighter click)
pi_ports = false;      // cut the Pi's own micro-USB ports (not needed, the UPS-Lite powers it)
vents = true;

/* [UPS-Lite end openings] */
// Measured from the photos: micro-USB charge port on the SD card end (left from the front),
// slide switch + LED on the other end. y = 0 is the middle of the board's width.
usb_y = 0;    usb_w = 12;  usb_h = 7.5;     // micro-USB plug overmould
sw_y = 0;     sw_w = 11;   sw_h = 6;        // slide switch + charge LED
sd_slot = true;                             // SD card access on the left end

/* [Stand] */
angle = 18;            // lean-back angle
foot = true;           // built-in foot on the back plate (set false and print "stand" for a separate cradle)
foot_h = 24;           // how far up the back the foot fins reach
foot_l = 26;           // length of the foot along the desk line
foot_span = 40;        // distance between the two fins
lift = 2;              // separate cradle only: extra height under the case

$fn = 56;
eps = 0.01;

// ---------- derived ----------
in_l = pcb_l + 2*clr;
in_w = pcb_w + 2*clr;
out_l = in_l + 2*wall;
out_w = in_w + 2*wall;
// depths, measured from the inside of the front face
z_hat = panel_t;                    // HAT top surface
z_pi_top = z_hat + pcb_t + hat_gap;
z_pi_bot = z_pi_top + pcb_t;
z_ups_top = z_pi_bot + ups_gap;     // UPS-Lite inner face
z_ups_bot = z_ups_top + pcb_t;      // UPS-Lite outer face, sits on the back plate
in_d = z_ups_bot;
out_d = front_t + in_d + back_t;    // the back plate sits flush inside the shell
inner_r = max(radius - wall, 0.6);

p_usb = 41.4; p_pwr = 54.0;         // Pi Zero micro-USB centres from the SD end
pi_holes = [for (sx=[-1,1], sy=[-1,1]) [sx*(pcb_l/2-hole_inset), sy*(pcb_w/2-hole_inset)]];
snaps_x = [-pcb_l/4, pcb_l/4];

module rrect(l, w, h, r) {
  r2 = min(r, l/2-eps, w/2-eps);
  translate([-l/2+r2, -w/2+r2, 0]) linear_extrude(h) offset(r=r2) square([l-2*r2, w-2*r2]);
}
module rslot2d(w, h) { offset(r=min(w,h)/2-eps) offset(delta=-(min(w,h)/2-eps)) square([w, h], center=true); }

// ---------- front shell (prints face down, no supports) ----------
module front() {
  win_l = aa_l + 2*window_margin; win_w = aa_w + 2*window_margin;
  difference() {
    union() {
      difference() {
        rrect(out_l, out_w, out_d, radius);
        translate([0,0,front_t]) rrect(in_l, in_w, out_d, inner_r);
      }
      // little ribs that stop the glass sliding sideways
      for (s=[-1,1]) translate([s*(panel_l/2 + 0.9), 0, front_t])
        translate([-0.5, -panel_w/2 + 5, 0]) cube([1, panel_w - 10, panel_t*0.7]);
    }
    // window with an outward bevel
    translate([aa_off_x, aa_off_y, -eps]) hull() {
      translate([0,0,front_t-0.8]) rrect(win_l, win_w, 0.8+2*eps, 0.8);
      rrect(win_l+2*window_chamfer, win_w+2*window_chamfer, eps, 0.8+window_chamfer);
    }
    // snap recesses for the back plate bumps
    for (x = snaps_x, s=[-1,1])
      translate([x, s*in_w/2, front_t + in_d + back_t/2]) rotate([0,90,0]) cylinder(d=2.2, h=7, center=true);
    // finger notch to pop the back plate out
    translate([0, out_w/2, out_d]) rotate([0,90,0]) cylinder(d=4, h=12, center=true);
    // UPS-Lite micro-USB (left end) and switch (right end), centred on the UPS board's inner face
    uz = front_t + z_ups_top - 2.0;
    translate([-out_l/2, usb_y, uz]) rotate([0,90,0]) linear_extrude(4*wall, center=true) rslot2d(usb_h, usb_w);
    translate([ out_l/2, sw_y,  uz]) rotate([0,90,0]) linear_extrude(4*wall, center=true) rslot2d(sw_h, sw_w);
    // SD card
    if (sd_slot) translate([-out_l/2, 0, front_t + z_pi_bot + 0.6]) rotate([0,90,0]) linear_extrude(4*wall, center=true) rslot2d(3.2, 13);
    // optional Pi micro-USB ports on the bottom edge
    if (pi_ports) for (px = [p_usb, p_pwr])
      translate([-pcb_l/2 + px, -out_w/2, front_t + z_pi_top - 1.6]) rotate([90,0,0]) linear_extrude(4*wall, center=true) rslot2d(11.5, 7.5);
  }
}

// ---------- back plate (prints flat, outside face down) ----------
// Drops flush into the back of the shell and clicks in on four bumps.
// The UPS-Lite's four corner screws come out; longer M2.5 screws (about 8 mm) go through this
// plate into the UPS-Lite's own standoffs, so the whole stack hangs off the back plate.
module back() {
  pl = in_l - 0.3; pw = in_w - 0.3;
  difference() {
    union() {
      rrect(pl, pw, back_t, inner_r);
      for (x = snaps_x, s=[-1,1])
        translate([x, s*pw/2, back_t/2]) scale([1, snap, 1]) rotate([0,90,0]) cylinder(d=2.0, h=6, center=true);
    }
    for (h = pi_holes) translate([h[0], h[1], -eps]) {
      cylinder(d=2.9, h=back_t+1);
      cylinder(d=5.0, h=1.2);
    }
    if (vents) for (i=[-3:3]) translate([i*6, 0, -eps]) linear_extrude(back_t+1) rslot2d(2.2, 15);
  }
  if (foot) kickstand();
}

// Built-in foot: two fins on the back plate. The case rests on its back-bottom edge and the
// fins' feet, leaning back by `angle`. Profile drawn in (u = up the back face from the bottom
// edge, v = out from the back face).
module foot_2d() {
  sa = sin(angle); ca = cos(angle);
  polygon([[4, 0], [foot_h, 0], [foot_l*sa, foot_l*ca], [(foot_l-8)*sa, (foot_l-8)*ca]]);
}
module place_foot() translate([0, -out_w/2, 0]) rotate([0, 90, 0]) rotate([0, 0, 90]) mirror([0,1,0]) children();
module kickstand() {
  sa = sin(angle); ca = cos(angle);
  place_foot() {
    for (x = [-foot_span/2, foot_span/2]) translate([0, 0, x - 2]) linear_extrude(4) foot_2d();
    // bar joining the two feet along the desk
    translate([0, 0, -foot_span/2 - 2]) linear_extrude(foot_span + 4)
      hull() for (t = [foot_l - 8, foot_l]) translate([t*sa, t*ca]) rotate(-(90-angle)) translate([0, -0.01]) square([3.5, 0.02], center=false);
  }
}

// ---------- angled desk cradle ----------
// Side profile in 2D (x = towards the back, y = up), extruded along the case length.
stand_l = out_l - 10;
foot_t = 3;
h0 = foot_t + lift + out_d*sin(angle);   // height of the case's front-bottom edge
module case_2d(c=0) translate([0, h0]) rotate(-angle) translate([-c, -c]) square([out_d + 2*c, out_w + 60]);
module stand_2d() {
  rest_h = out_w * 0.5;
  back_x = rest_h * sin(angle) + (out_d + 3) * cos(angle);
  difference() {
    union() {
      hull() {                                                       // foot + seat under the case
        translate([-5, 0]) square([back_x + 12, foot_t]);
        translate([0, h0]) rotate(-angle) translate([-3, -2]) square([out_d + 6, 5.5]);
      }
      hull() {                                                       // back rest
        translate([out_d*0.5, 0]) square([back_x - out_d*0.5 + 7, foot_t]);
        translate([0, h0]) rotate(-angle) translate([out_d, 0]) square([3, rest_h]);
      }
    }
    case_2d(0.25);
  }
}
module stand() {
  intersection() {
    rotate([90, 0, 90]) translate([0, 0, -stand_l/2]) linear_extrude(stand_l) stand_2d();
    // soften the ends
    translate([0, 15, 0]) rrect(stand_l, 120, 80, 3);
  }
}

// ---------- test-fit: front face only ----------
module testfit() { intersection() { front(); translate([0,0,-1]) rrect(out_l+2, out_w+2, front_t+2, 1); } }

// ---------- preview stand-ins ----------
module hardware() {
  color("whitesmoke") translate([0, 0, front_t]) rrect(panel_l, panel_w, panel_t, 0.5);
  color("royalblue")  translate([0, 0, front_t + z_hat]) rrect(pcb_l, pcb_w, pcb_t, 3);
  color("seagreen")   translate([0, 0, front_t + z_pi_top]) rrect(pcb_l, 30, pcb_t, 3);
  color("silver")     translate([0, 0, front_t + z_pi_bot + 2]) rrect(50, 25, 6, 1);
  color("black")      translate([0, 0, front_t + z_ups_top]) rrect(pcb_l, pcb_w, pcb_t, 3);
}

module assembly() {
  front();
  %hardware();
  translate([0, 0, out_d + 0.01]) mirror([0,0,1]) back();  // sits flush in the shell
}

if (part == "front") front();
else if (part == "back") rotate([foot ? 180 : 0, 0, 0]) back();   // foot side up for printing
else if (part == "stand") stand();
else if (part == "testfit") testfit();
else if (part != "scene") assembly();

// ---------- preview scene: the case sitting in its stand ----------
module scene(col_case="#e9e4da", col_foot="#e9e4da") {
  rotate([-angle,0,0]) translate([0, -out_d, out_w/2]) rotate([90,0,180]) {
    color(col_case) front();
    color(col_foot) translate([0,0,out_d+0.01]) mirror([0,0,1]) back();
    color("#f4f4ef") translate([aa_off_x, aa_off_y, front_t - 0.5]) rrect(aa_l+1, aa_w+1, 0.3, 0.5);
  }
  if (!foot) color("#3a3a3a") stand();
}
if (part == "scene") scene();
