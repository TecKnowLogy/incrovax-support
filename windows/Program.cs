using System.Drawing.Imaging;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace INCrovax.Control;
internal static class Program
{
    [STAThread] static void Main() { ApplicationConfiguration.Initialize(); Application.Run(new SupportForm()); }
}
internal sealed class SupportForm : Form
{
    readonly TextBox server = new() { Text = "https://control.incrovax.de" };
    readonly TextBox code = new();
    readonly Button register = new() { Text = "Gerät registrieren" };
    readonly Button stop = new() { Text = "ZUGRIFF BEENDEN", Enabled = false };
    readonly Label status = new() { Text = "Noch nicht verbunden.", AutoSize = false };
    readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(8) };
    readonly System.Windows.Forms.Timer timer = new() { Interval = 1000 };
    string? deviceId, activeSession;
    bool polling;
    readonly HashSet<ushort> heldKeys = [];
    readonly HashSet<int> heldButtons = [];
    public SupportForm()
    {
        Text = "INCrovax QuickSupport · Entwicklung 0.1"; ClientSize = new Size(660, 440);
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        BackColor = Color.FromArgb(18,24,27); ForeColor = Color.White;
        Font = new Font("Segoe UI", 10); StartPosition = FormStartPosition.CenterScreen;
        using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("INCrovax.Logo.png");
        if (resource != null) { var image = new PictureBox { Bounds = new Rectangle(20,5,340,95), SizeMode = PictureBoxSizeMode.Zoom, Image = new Bitmap(Image.FromStream(resource)) }; Controls.Add(image); }
        AddLabel("Serveradresse",20,105); server.SetBounds(20,130,620,30); Controls.Add(server);
        AddLabel("Einmaliger Registrierungscode vom Techniker",20,170); code.SetBounds(20,195,620,30); Controls.Add(code);
        register.SetBounds(20,240,260,38); register.BackColor = Color.FromArgb(145,255,0); register.ForeColor = Color.Black; Controls.Add(register);
        stop.SetBounds(300,240,340,38); stop.BackColor = Color.FromArgb(125,35,45); stop.ForeColor = Color.White; Controls.Add(stop);
        status.SetBounds(20,295,620,60); Controls.Add(status);
        var notice = new Label { Text = "Testfassung: Hauptmonitor, einfache Eingaben, ca. 1 Bild/s.\nKeine Ende-zu-Ende-Verschlüsselung. Keine UAC-Steuerung.\nKeine Installation und kein unbeaufsichtigter Zugriff.", Bounds = new Rectangle(20,363,620,70), ForeColor = Color.Silver }; Controls.Add(notice);
        register.Click += async (_,_) => await Register();
        stop.Click += async (_,_) => await EndSession();
        timer.Tick += async (_,_) => await Poll();
        FormClosed += (_,_) => { timer.Stop(); ReleaseInput(); http.Dispose(); };
    }
    void AddLabel(string text,int x,int y) => Controls.Add(new Label { Text = text, Bounds = new Rectangle(x,y,620,25) });
    async Task<JsonElement> Post(string path, object payload)
    {
        using var response = await http.PostAsJsonAsync(path, payload);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    async Task Register()
    {
        register.Enabled = false;
        try
        {
            if (!Uri.TryCreate(server.Text.Trim().TrimEnd('/') + "/", UriKind.Absolute, out var uri) || (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback))) throw new InvalidOperationException("HTTPS-Serveradresse eingeben. HTTP ist nur lokal erlaubt.");
            http.BaseAddress = uri;
            var result = await Post("api/agent/enroll", new { code = code.Text.Trim(), name = Environment.MachineName, os = RuntimeInformation.OSDescription });
            deviceId = result.GetProperty("id").GetString();
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", result.GetProperty("token").GetString());
            code.Clear(); code.Enabled = false; server.Enabled = false;
            status.Text = "Registriert. Warten auf eine Supportanfrage.\nBildschirm und Eingaben bleiben bis zu deiner Freigabe gesperrt.";
            timer.Start();
        }
        catch (Exception err) { status.Text = "Registrierung fehlgeschlagen: " + err.Message; register.Enabled = true; }
    }
    async Task Poll()
    {
        if (polling || deviceId == null || IsDisposed) return;
        polling = true;
        try
        {
            var result = await Post("api/agent/poll", new { os = RuntimeInformation.OSDescription });
            var session = result.GetProperty("session");
            if (session.ValueKind == JsonValueKind.Null) { if (activeSession != null) ClearSession("Die Sitzung ist beendet."); return; }
            var id = session.GetProperty("id").GetString()!;
            var state = session.GetProperty("state").GetString();
            if (state == "requested" && activeSession == null)
            {
                var accepted = MessageBox.Show(this,"Der angemeldete INCrovax-Techniker möchte deinen Hauptbildschirm sehen und Maus sowie Tastatur bedienen.\n\nZugriff jetzt freigeben? Du kannst jederzeit mit ZUGRIFF BEENDEN abbrechen.","Supportanfrage",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2) == DialogResult.Yes;
                await Post("api/agent/" + id + "/consent",new { accept = accepted });
                if (!accepted) { status.Text = "Anfrage abgelehnt. Es wurde kein Zugriff freigegeben."; return; }
                activeSession = id; stop.Enabled = true; status.Text = "ZUGRIFF AKTIV · Bildschirm, Maus und Tastatur freigegeben.\nZum Abbrechen ZUGRIFF BEENDEN drücken oder dieses Fenster schließen.";
                return;
            }
            if (state != "active" || activeSession != id) return;
            foreach (var input in result.GetProperty("events").EnumerateArray()) ApplyInput(input);
            if (activeSession != id) return;
            using var image = Capture(); using var memory = new MemoryStream();
            var jpeg = ImageCodecInfo.GetImageEncoders().First(x => x.FormatID == ImageFormat.Jpeg.Guid);
            using var quality = new EncoderParameters(1); quality.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,45L);
            image.Save(memory,jpeg,quality);
            if (memory.Length > 2*1024*1024) throw new InvalidOperationException("Bild überschreitet die Testgrenze.");
            using var content = new ByteArrayContent(memory.ToArray()); content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            using var response = await http.PostAsync("api/agent/" + id + "/frame",content); response.EnsureSuccessStatusCode();
        }
        catch (Exception err) { ClearSession("Verbindung unterbrochen. Zugriff gestoppt.\n" + err.Message); }
        finally { polling = false; }
    }
    static Bitmap Capture()
    {
        var bounds = Screen.PrimaryScreen!.Bounds; var original = new Bitmap(bounds.Width,bounds.Height);
        using (var graphics = Graphics.FromImage(original)) graphics.CopyFromScreen(bounds.Location, Point.Empty,bounds.Size);
        int width = Math.Min(1440,bounds.Width), height = Math.Max(1,(int)((double)bounds.Height * width / bounds.Width));
        var scaled = new Bitmap(original,new Size(width,height)); original.Dispose(); return scaled;
    }
    void ClearSession(string text) { activeSession = null; ReleaseInput(); stop.Enabled = false; if (!IsDisposed) status.Text = text; }
    async Task EndSession()
    {
        var id = activeSession; ClearSession("Zugriff lokal beendet. Warten auf eine neue Anfrage.");
        if (id != null) try { await Post("api/agent/" + id + "/end",new { }); } catch { status.Text = "Zugriff lokal beendet. Verbindung zum Server unterbrochen."; }
    }
    void ApplyInput(JsonElement e)
    {
        if (activeSession == null) return;
        var kind = e.GetProperty("kind").GetString();
        if (kind is "move" or "button")
        {
            var x=e.GetProperty("x").GetDouble(); var y=e.GetProperty("y").GetDouble();
            if (!double.IsFinite(x)||!double.IsFinite(y)||x<0||x>1||y<0||y>1) return;
            var b=Screen.PrimaryScreen!.Bounds; SetCursorPos(b.X+(int)(x*(b.Width-1)),b.Y+(int)(y*(b.Height-1)));
        }
        if (kind == "button") { var button=e.GetProperty("button").GetInt32(); if (button is not (0 or 2)) return; var down=e.GetProperty("down").GetBoolean(); Mouse(button==0 ? (down ? 2u:4u) : (down ? 8u:16u)); if(down) heldButtons.Add(button); else heldButtons.Remove(button); }
        if (kind == "scroll") { var direction=e.GetProperty("delta").GetInt32(); if(direction is -1 or 1) Mouse(0x0800,unchecked((uint)(direction*120))); }
        if (kind == "key") { var key=VirtualKey(e.GetProperty("key").GetString()??""); if(key==0) return; var down=e.GetProperty("down").GetBoolean(); Key(key,!down); if(down) heldKeys.Add(key); else heldKeys.Remove(key); }
    }
    static ushort VirtualKey(string key)
    {
        if (key.Length==1 && char.IsAsciiLetterOrDigit(key[0])) return char.ToUpperInvariant(key[0]);
        return key switch { " "=>0x20,"Enter"=>0x0D,"Escape"=>0x1B,"Tab"=>0x09,"Backspace"=>0x08,"Delete"=>0x2E,"ArrowLeft"=>0x25,"ArrowUp"=>0x26,"ArrowRight"=>0x27,"ArrowDown"=>0x28,"Home"=>0x24,"End"=>0x23,"PageUp"=>0x21,"PageDown"=>0x22,"Shift"=>0x10,"Control"=>0x11,"Alt"=>0x12,_=>0 };
    }
    void ReleaseInput() { foreach(var key in heldKeys) Key(key,true); foreach(var b in heldButtons) Mouse(b==0?4u:16u); heldKeys.Clear(); heldButtons.Clear(); }
    static void Key(ushort key,bool up) { var input=new INPUT { type=1, data=new INPUTUNION { keyboard=new KEYBDINPUT { vk=key, flags=up?2u:0u } } }; SendInput(1,[input],Marshal.SizeOf<INPUT>()); }
    static void Mouse(uint flags,uint data=0) { var input=new INPUT { type=0, data=new INPUTUNION { mouse=new MOUSEINPUT { flags=flags, mouseData=data } } }; SendInput(1,[input],Marshal.SizeOf<INPUT>()); }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT keyboard; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,flags,time; public nuint extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk,scan; public uint flags,time; public nuint extra; }
    [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] inputs,int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
}
