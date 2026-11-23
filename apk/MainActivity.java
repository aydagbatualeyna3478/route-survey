package com.routesurvey.etut;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Environment;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import androidx.core.content.FileProvider;
import android.provider.DocumentsContract;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import org.json.JSONArray;
import org.json.JSONObject;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/* AndroidFolder: the backup folder the user picks with Android's own folder picker (Storage Access Framework),
   so the backup can go anywhere the tablet offers (internal storage, SD card, USB…). All paths are relative to that folder.
   Methods return "" / data on success and "ERR:<message>" on failure. */
/* window.print() does nothing inside an Android WebView, so the report page calls AndroidPrint.print(name):
   it opens Android's print dialog, where "Save as PDF" writes the report as a PDF. */
public class MainActivity extends BridgeActivity {
    private static final int PICK_FOLDER = 4711;
    private final HashMap<String, String> ids = new HashMap<>();   // path -> document id, inside the picked folder

    private SharedPreferences prefs() { return getSharedPreferences("backup", MODE_PRIVATE); }
    private Uri tree() { String u = prefs().getString("tree", null); return u == null ? null : Uri.parse(u); }
    private boolean granted(Uri t) {
        if (t == null) return false;
        for (UriPermission p : getContentResolver().getPersistedUriPermissions()) if (p.getUri().equals(t) && p.isWritePermission()) return true;
        return false;
    }
    private static String err(Exception e) { return "ERR:" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()); }
    private static String parentOf(String path) { int i = path.lastIndexOf('/'); return i < 0 ? "" : path.substring(0, i); }
    private static String nameOf(String path) { return path.substring(path.lastIndexOf('/') + 1); }

    private String childId(Uri t, String parentId, String name) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, parentId);
        try (Cursor c = getContentResolver().query(kids, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c != null) while (c.moveToNext()) if (name.equals(c.getString(1))) return c.getString(0);
        }
        return null;
    }
    /* document id of a path ("" = the picked folder); creates missing folders when create is true */
    private String idOf(String path, boolean create, boolean dir) throws Exception {
        Uri t = tree(); if (t == null) throw new Exception("Klasör seçilmedi");
        path = path.replaceAll("^/+|/+$", "");
        if (path.isEmpty()) return DocumentsContract.getTreeDocumentId(t);
        String hit = ids.get(path); if (hit != null) return hit;
        String parent = idOf(parentOf(path), create, true);
        if (parent == null) return null;
        String id = childId(t, parent, nameOf(path));
        if (id == null && create && dir) {
            Uri made = DocumentsContract.createDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(t, parent), DocumentsContract.Document.MIME_TYPE_DIR, nameOf(path));
            if (made == null) throw new Exception("Klasör oluşturulamadı: " + path);
            id = DocumentsContract.getDocumentId(made);
        }
        if (id != null) ids.put(path, id);
        return id;
    }
    private Uri docUri(String id) { return DocumentsContract.buildDocumentUriUsingTree(tree(), id); }
    private void forget(String path) { ids.remove(path); String pre = path + "/"; java.util.Iterator<String> it = ids.keySet().iterator(); while (it.hasNext()) if (it.next().startsWith(pre)) it.remove(); }
    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        return n.endsWith(".jpg") ? "image/jpeg" : n.endsWith(".png") ? "image/png" : n.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    }

    /* full screen: the tablet's navigation and status bars are hidden; a swipe from the edge shows them for a moment */
    private void immersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive(); }
    @Override
    public void onResume() { super.onResume(); immersive(); }

    /* minimal PDF written straight to the file, page by page (one JPEG per page in the page's own size),
       so even a 300-page report never has to fit in memory at once */
    static final class PdfOut implements AutoCloseable {
        final java.io.OutputStream o; long pos = 0; final List<Long> offs = new ArrayList<>(); final List<Integer> kids = new ArrayList<>(); int next = 3;
        PdfOut(File f) throws Exception {
            o = new java.io.BufferedOutputStream(new FileOutputStream(f), 1 << 16);
            w("%PDF-1.4\n%âãÏÓ\n"); obj(1); w("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        }
        void w(String t) throws Exception { byte[] b = t.getBytes("ISO-8859-1"); o.write(b); pos += b.length; }
        void w(byte[] b) throws Exception { o.write(b); pos += b.length; }
        void obj(int n) { while (offs.size() < n) offs.add(0L); offs.set(n - 1, pos); }
        void page(byte[] jpg, int bw, int bh, double pw, double ph) throws Exception {
            int po = next, co = po + 1, io = po + 2; next += 3; kids.add(po);
            String W = String.format(java.util.Locale.ROOT, "%.2f", pw), H = String.format(java.util.Locale.ROOT, "%.2f", ph);
            obj(po); w(po + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + io + " 0 R >> >> /Contents " + co + " 0 R >>\nendobj\n");
            byte[] cs = ("q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q").getBytes("ISO-8859-1");
            obj(co); w(co + " 0 obj\n<< /Length " + cs.length + " >>\nstream\n"); w(cs); w("\nendstream\nendobj\n");
            obj(io); w(io + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + bw + " /Height " + bh + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpg.length + " >>\nstream\n");
            w(jpg); w("\nendstream\nendobj\n");
        }
        void finish() throws Exception {
            StringBuilder k = new StringBuilder(); for (int id : kids) k.append(id).append(" 0 R ");
            obj(2); w("2 0 obj\n<< /Type /Pages /Kids [" + k + "] /Count " + kids.size() + " >>\nendobj\n");
            long xref = pos; int n = offs.size();
            StringBuilder x = new StringBuilder("xref\n0 " + (n + 1) + "\n0000000000 65535 f \n");
            for (long of : offs) x.append(String.format(java.util.Locale.ROOT, "%010d 00000 n \n", of));
            x.append("trailer\n<< /Size ").append(n + 1).append(" /Root 1 0 R >>\nstartxref\n").append(xref).append("\n%%EOF\n");
            w(x.toString()); o.flush();
        }
        @Override public void close() throws Exception { o.close(); }
    }
    private File pdfFile(String name) {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Etütler");
        if (!dir.exists() && !dir.mkdirs()) dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        String safe = name.replaceAll("[\\\\/:*?\"<>|]+", "-").trim();
        File f = new File(dir, (safe.isEmpty() ? "Route Survey Report" : safe) + ".pdf");
        try { new FileOutputStream(f).close(); } catch (Exception e) { f = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), f.getName()); }   // public Documents not writable: the app's own folder
        return f;
    }
    private void share(File f) {
        try {
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_SEND); i.setType("application/pdf"); i.putExtra(Intent.EXTRA_STREAM, u); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "PDF raporu"));
        } catch (Exception e) {
            Toast.makeText(this, "PDF kaydedildi: " + f.getAbsolutePath(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FOLDER) return;
        String js;
        if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
            Uri t = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(t, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                Uri old = tree();
                if (old != null && !old.equals(t)) try { getContentResolver().releasePersistableUriPermission(old, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) {}
                prefs().edit().putString("tree", t.toString()).apply(); ids.clear();
                js = "window.__folderPicked && window.__folderPicked(" + JSONObject.quote(t.toString()) + ")";
            } catch (Exception e) { js = "window.__folderPicked && window.__folderPicked(null, " + JSONObject.quote(err(e)) + ")"; }
        } else js = "window.__folderPicked && window.__folderPicked(null)";
        final String run = js;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(run, null));
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebView.enableSlowWholeDocumentDraw();   // the PDF maker draws pages that are not on screen
        super.onCreate(savedInstanceState);
        immersive();
        final WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void print(final String name) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(name);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .build();
                        pm.print(name, adapter, attrs);
                    }
                });
            }
        }, "AndroidPrint");

        /* AndroidPdf: the report as one PDF made page by page, each page in its own size (portrait / landscape A4, A3).
           The page script shows one report page at a time at the top of the document; add() draws it from the WebView
           (~190 dpi JPEG) and writes it straight to the PDF file, so long reports (300 pages) neither run out of memory
           nor come out grey (a WebView cannot draw a document that is hundreds of pages tall in one go).
           begin(name) → "" or error · add({x,y,w,h,pw,ph,scale}) → window.__pdfStep(error|null) · end() → window.__pdfDone(path, error) */
        web.addJavascriptInterface(new Object() {
            PdfOut out; File file;
            @JavascriptInterface public String begin(final String name) {
                try { if (out != null) out.close(); } catch (Exception e) { /* old one */ }
                try { file = pdfFile(name); out = new PdfOut(file); return ""; } catch (Throwable e) { out = null; return String.valueOf(e.getMessage()); }
            }
            @JavascriptInterface public void add(final String json) {
                runOnUiThread(() -> {
                    String err = null;
                    try {
                        JSONObject pg = new JSONObject(json);
                        float dens = getResources().getDisplayMetrics().density, S = (float) pg.optDouble("scale", 2.0);
                        double x = pg.getDouble("x"), y = pg.getDouble("y"), w = pg.getDouble("w"), h = pg.getDouble("h");
                        int bw = (int) Math.round(w * S), bh = (int) Math.round(h * S);
                        Bitmap bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
                        Canvas c = new Canvas(bmp); c.drawColor(Color.WHITE);
                        c.scale(S / dens, S / dens);
                        c.translate((float) (-x * dens + web.getScrollX()), (float) (-y * dens + web.getScrollY()));
                        web.draw(c);
                        ByteArrayOutputStream bo = new ByteArrayOutputStream(1 << 20);
                        bmp.compress(Bitmap.CompressFormat.JPEG, 85, bo); bmp.recycle();
                        double pw = pg.optDouble("pw", 0), ph = pg.optDouble("ph", 0);
                        if (pw <= 100 || ph <= 100) { pw = w > h ? 841.89 : 595.28; ph = w > h ? 595.28 : 841.89; }
                        out.page(bo.toByteArray(), bw, bh, pw, ph);
                    } catch (Throwable e) { err = String.valueOf(e.getMessage()); }
                    final String run = "window.__pdfStep && window.__pdfStep(" + (err == null ? "null" : JSONObject.quote(err)) + ")";
                    web.post(() -> web.evaluateJavascript(run, null));
                });
            }
            @JavascriptInterface public void end(final boolean ok) {
                runOnUiThread(() -> {
                    String done;
                    try {
                        if (ok) out.finish();
                        out.close(); out = null;
                        if (!ok) { file.delete(); throw new Exception("iptal"); }
                        share(file);
                        done = "window.__pdfDone && window.__pdfDone(" + JSONObject.quote(file.getAbsolutePath()) + ", null)";
                    } catch (Throwable e) {
                        done = "window.__pdfDone && window.__pdfDone(null, " + JSONObject.quote(String.valueOf(e.getMessage())) + ")";
                    }
                    final String run = done;
                    web.post(() -> web.evaluateJavascript(run, null));
                });
            }
        }, "AndroidPdf");

        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void pick() {
                runOnUiThread(() -> {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                    startActivityForResult(i, PICK_FOLDER);
                });
            }
            /* {"uri":…, "name":…, "ok":true} or "" when none is set */
            @JavascriptInterface public String current() {
                Uri t = tree(); if (t == null) return "";
                try {
                    String name = t.getLastPathSegment();
                    try (Cursor c = getContentResolver().query(DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t)), new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                        if (c != null && c.moveToFirst()) name = c.getString(0);
                    }
                    JSONObject o = new JSONObject(); o.put("uri", t.toString()); o.put("name", name); o.put("ok", granted(t));
                    return o.toString();
                } catch (Exception e) { return ""; }
            }
            @JavascriptInterface public void clear() { prefs().edit().remove("tree").apply(); ids.clear(); }
            @JavascriptInterface public String write(String path, String b64) {
                try {
                    String id = idOf(path, false, false);
                    if (id == null) {
                        String parent = idOf(parentOf(path), true, true);
                        Uri made = DocumentsContract.createDocument(getContentResolver(), docUri(parent), mimeOf(path), nameOf(path));
                        if (made == null) return "ERR:Dosya oluşturulamadı: " + path;
                        id = DocumentsContract.getDocumentId(made); ids.put(path, id);
                    }
                    byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                    OutputStream os; try { os = getContentResolver().openOutputStream(docUri(id), "wt"); } catch (Exception m) { os = getContentResolver().openOutputStream(docUri(id), "w"); }   // some folders (cloud) do not know "wt"
                    if (os == null) return "ERR:Dosya açılamadı: " + path;
                    try (OutputStream o = os) { o.write(bytes); }
                    return "";
                } catch (Exception e) { forget(path); return err(e); }
            }
            @JavascriptInterface public String read(String path) {
                try {
                    String id = idOf(path, false, false); if (id == null) return "ERR:Bulunamadı: " + path;
                    try (InputStream in = getContentResolver().openInputStream(docUri(id))) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        return Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
                    }
                } catch (Exception e) { return err(e); }
            }
            @JavascriptInterface public String remove(String path) {
                try { String id = idOf(path, false, false); if (id != null) DocumentsContract.deleteDocument(getContentResolver(), docUri(id)); forget(path.replaceAll("/+$", "")); return ""; }
                catch (Exception e) { forget(path.replaceAll("/+$", "")); return err(e); }
            }
            /* move a file to another path (folders are created); falls back to an error so the caller rewrites it */
            @JavascriptInterface public String move(String from, String to) {
                try {
                    ContentResolver cr = getContentResolver();
                    String id = idOf(from, false, false); if (id == null) return "ERR:Bulunamadı: " + from;
                    if (idOf(to, false, false) != null) return "ERR:Hedef dolu: " + to;
                    String srcParent = idOf(parentOf(from), false, true), dstParent = idOf(parentOf(to), true, true);
                    Uri u = docUri(id);
                    if (!srcParent.equals(dstParent)) { if (android.os.Build.VERSION.SDK_INT < 24) return "ERR:Bu Android sürümünde taşıma yok"; u = DocumentsContract.moveDocument(cr, u, docUri(srcParent), docUri(dstParent)); if (u == null) return "ERR:Taşınamadı"; }
                    if (!nameOf(from).equals(nameOf(to))) { u = DocumentsContract.renameDocument(cr, u, nameOf(to)); if (u == null) return "ERR:Ad değiştirilemedi"; }
                    forget(from); ids.put(to, DocumentsContract.getDocumentId(u));
                    return "";
                } catch (Exception e) { forget(from); forget(to); return err(e); }
            }
            /* [{"name":…, "dir":true|false}, …] */
            @JavascriptInterface public String list(String path) {
                try {
                    String id = idOf(path, false, true); if (id == null) return "[]";
                    JSONArray a = new JSONArray();
                    try (Cursor c = getContentResolver().query(DocumentsContract.buildChildDocumentsUriUsingTree(tree(), id), new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
                        if (c != null) while (c.moveToNext()) { JSONObject o = new JSONObject(); o.put("name", c.getString(0)); o.put("dir", DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(1))); a.put(o); }
                    }
                    return a.toString();
                } catch (Exception e) { return err(e); }
            }
        }, "AndroidFolder");
    }
}
