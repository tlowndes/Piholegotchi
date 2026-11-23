# Piholegotchi's Windows helper: media keys, volume, the window you're in, and whether your mic or camera is on.
# Reads one JSON request per line on stdin, writes one JSON reply per line on stdout.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Pg {
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr n);
    int UnregisterControlChangeNotify(IntPtr n);
    int GetChannelCount(out int count);
    int SetMasterVolumeLevel(float db, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float db);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float db);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr ctl);
    int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr vol);
    int GetSessionEnumerator(out IAudioSessionEnumerator e);
  }
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int i, out IAudioSessionControl2 s);
  }
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
    int GetGroupingParam(out Guid g);
    int SetGroupingParam(ref Guid g, ref Guid ctx);
    int RegisterAudioSessionNotification(IntPtr n);
    int UnregisterAudioSessionNotification(IntPtr n);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
  }
  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid ctx);
    int GetMasterVolume(out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  public class Session { public uint Pid; public string Name; public int Volume; public bool Muted; }

  public static class Audio {
    static IMMDevice Speakers() {
      var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d); return d;
    }
    static IAudioEndpointVolume Endpoint() {
      var iid = typeof(IAudioEndpointVolume).GUID; object o;
      Speakers().Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o;
    }
    public static int GetVolume() { float v; Endpoint().GetMasterVolumeLevelScalar(out v); return (int)Math.Round(v * 100); }
    public static bool GetMute() { bool m; Endpoint().GetMute(out m); return m; }
    public static void SetVolume(int v) { var g = Guid.Empty; Endpoint().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, v)) / 100f, ref g); }
    public static void SetMute(bool m) { var g = Guid.Empty; Endpoint().SetMute(m, ref g); }

    static List<IAudioSessionControl2> All() {
      var iid = typeof(IAudioSessionManager2).GUID; object o;
      Speakers().Activate(ref iid, 23, IntPtr.Zero, out o);
      IAudioSessionEnumerator en; ((IAudioSessionManager2)o).GetSessionEnumerator(out en);
      int n; en.GetCount(out n);
      var list = new List<IAudioSessionControl2>();
      for (int i = 0; i < n; i++) { IAudioSessionControl2 s; en.GetSession(i, out s); list.Add(s); }
      return list;
    }
    public static List<Session> Sessions() {
      var outp = new Dictionary<string, Session>();
      foreach (var s in All()) {
        uint pid; s.GetProcessId(out pid);
        if (pid == 0) continue;
        string name;
        try { name = Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
        var v = (ISimpleAudioVolume)s; float lvl; bool mute; v.GetMasterVolume(out lvl); v.GetMute(out mute);
        if (!outp.ContainsKey(name)) outp[name] = new Session { Pid = pid, Name = name, Volume = (int)Math.Round(lvl * 100), Muted = mute };
      }
      return new List<Session>(outp.Values);
    }
    public static void SetSession(string name, int vol) {
      var g = Guid.Empty;
      foreach (var s in All()) {
        uint pid; s.GetProcessId(out pid);
        if (pid == 0) continue;
        string n; try { n = Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
        if (n == name) ((ISimpleAudioVolume)s).SetMasterVolume(Math.Max(0, Math.Min(100, vol)) / 100f, ref g);
      }
    }
  }

  public static class Win {
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    public static void Key(byte vk) { keybd_event(vk, 0, 1, UIntPtr.Zero); keybd_event(vk, 0, 3, UIntPtr.Zero); }
    public static void Chord(byte mod, byte vk) {
      keybd_event(mod, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 0, UIntPtr.Zero);
      keybd_event(vk, 0, 2, UIntPtr.Zero); keybd_event(mod, 0, 2, UIntPtr.Zero);
    }
    public static string[] Foreground() {
      var h = GetForegroundWindow(); var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      uint pid; GetWindowThreadProcessId(h, out pid); string name = "";
      try { name = Process.GetProcessById((int)pid).ProcessName; } catch { }
      return new[] { name, sb.ToString() };
    }
  }
}
'@

# Something is using the mic or camera right now if an app's LastUsedTimeStop is 0.
function In-Use($what) {
  $root = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$what"
  if (-not (Test-Path $root)) { return @() }
  $apps = @()
  Get-ChildItem $root -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p -and $p.LastUsedTimeStart -and $p.LastUsedTimeStop -eq 0) { $apps += ($_.PSChildName -replace '^.*#', '' -replace '\.exe$', '') }
  }
  return $apps
}

$keys = @{ play = 0xB3; next = 0xB0; prev = 0xB1; mute = 0xAD; up = 0xAF; down = 0xAE }

[Console]::Out.WriteLine('{"ready":true}')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $out = @{}
  try {
    $q = $line | ConvertFrom-Json
    $out.id = $q.id
    switch ($q.cmd) {
      'key'      { [Pg.Win]::Key([byte]$keys[$q.key]); $out.ok = $true }
      'dictate'  { [Pg.Win]::Chord(0x5B, 0x48); $out.ok = $true }
      'volume'   { $out.master = [Pg.Audio]::GetVolume(); $out.muted = [Pg.Audio]::GetMute()
                   $out.sessions = @([Pg.Audio]::Sessions() | ForEach-Object { @{ name = $_.Name; volume = $_.Volume; muted = $_.Muted } }) }
      'setvol'   { if ($q.name) { [Pg.Audio]::SetSession($q.name, [int]$q.volume) } else { [Pg.Audio]::SetVolume([int]$q.volume) }; $out.ok = $true }
      'setmute'  { [Pg.Audio]::SetMute([bool]$q.muted); $out.ok = $true }
      'fg'       { $f = [Pg.Win]::Foreground(); $out.app = $f[0]; $out.title = $f[1] }
      'inuse'    { $out.mic = @(In-Use 'microphone'); $out.cam = @(In-Use 'webcam') }
      default    { $out.error = "unknown command" }
    }
  } catch { $out.error = $_.Exception.Message }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
}
