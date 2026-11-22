package com.kokabfodool.shell;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.*;
import android.net.Uri;
import android.graphics.Color;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.os.Build;
import android.text.InputType;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
public class MainActivity extends Activity {
    private WebView web;
    private FudoolDevice device;
    private String host;
    private String home;
    private String backupProject;
    private String backupKey;
    private boolean returningFromGame;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        // Preserve the old offline package and origin so saved progress is retained on update.
        host="appassets.androidplatform.net";
        home="https://"+host+"/play-app/";
        getWindow().setStatusBarColor(Color.rgb(73,48,143));
        getWindow().setNavigationBarColor(Color.WHITE);
        web=new WebView(this);
        web.setFocusableInTouchMode(true);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        web.setBackgroundColor(Color.rgb(248,246,255));
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);s.setUserAgentString(s.getUserAgentString()+" FudoolAndroidUnified");
        readBackupConfig();
        s.setBlockNetworkLoads(backupProject == null);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        device = new FudoolDevice(this, web, backupProject != null);
        web.addJavascriptInterface(device, "FudoolDevice");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();String p=u.getPath();
                if(req.isForMainFrame() && "https".equals(u.getScheme()) && host.equals(u.getHost()) && "/play-app/external/".equals(p)){openExternalLink(u.getQueryParameter("url"));return true;}
                if ("https".equals(u.getScheme()) && host.equals(u.getHost())) {
                    if (req.isForMainFrame() && WorksheetActivity.validPath(p)) {
                        String source = view.getUrl();
                        String sourcePath = source == null ? null : Uri.parse(source).getPath();
                        boolean arabic = sourcePath == null || !sourcePath.startsWith("/en/");
                        startActivity(new Intent(MainActivity.this, WorksheetActivity.class)
                                .putExtra("worksheet", p).putExtra("arabic", arabic));
                        return true;
                    }
                    if (allowedPage(p)) return false;
                }
                if(req.isForMainFrame())Toast.makeText(MainActivity.this,"هذا الرابط غير متاح | Link unavailable",Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();
                if (allowedBackupRequest(req)) return null;
                if(!"https".equals(u.getScheme())||!host.equals(u.getHost()))return error(403,"Blocked");
                return local(u,req.getRequestHeaders());
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (returningFromGame && url.contains("/play-app/") && url.endsWith("#v5-games")) {
                    returningFromGame = false;
                    view.clearHistory();
                    view.scrollTo(0, 0);
                    view.evaluateJavascript("window.scrollTo(0,0);requestAnimationFrame(()=>window.scrollTo(0,0));", null);
                }
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError e){
                if(req.isForMainFrame())runOnUiThread(()->Toast.makeText(MainActivity.this,"تعذر فتح الصفحة | Unable to open page",Toast.LENGTH_SHORT).show());
            }
        });
        if (Build.VERSION.SDK_INT >= 35) {
            getWindow().setDecorFitsSystemWindows(false);
            FrameLayout viewport = new FrameLayout(this);
            viewport.setBackgroundColor(Color.rgb(248,246,255));
            viewport.addView(web, new FrameLayout.LayoutParams(-1, -1));
            padForSystemBars(viewport);
            setContentView(viewport);
            viewport.requestApplyInsets();
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars != null) {
                int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                bars.setSystemBarsAppearance(lightBars, lightBars);
            }
        } else {
            setContentView(web);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
        if(state==null)web.loadUrl(home);else if(web.restoreState(state)==null)web.loadUrl(home);
    }
    private void readBackupConfig() {
        try (InputStream input = getAssets().open("site/assets/parent-backup-config.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (bytes.size() + read > 1024) return;
                bytes.write(buffer, 0, read);
            }
            JSONObject config = new JSONObject(new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
            String project = config.optString("projectId");
            String key = config.optString("apiKey");
            if (project.matches("[a-z][a-z0-9-]{4,28}[a-z0-9]") && key.matches("AIza[a-zA-Z0-9_-]{30,45}")) {
                backupProject = project;
                backupKey = key;
            }
        } catch (IOException | org.json.JSONException ignored) {
            // With no connected parent backup project, the WebView remains offline.
        }
    }

    private boolean allowedBackupRequest(WebResourceRequest request) {
        if (backupProject == null || request.isForMainFrame()) return false;
        Uri url = request.getUrl();
        String path = url.getPath();
        String method = request.getMethod();
        if (!"https".equals(url.getScheme()) || url.getUserInfo() != null
                || (url.getPort() != -1 && url.getPort() != 443) || path == null) return false;
        if ("identitytoolkit.googleapis.com".equals(url.getHost())) {
            return ("POST".equals(method) || "OPTIONS".equals(method))
                    && path.matches("/v1/accounts:(signUp|signInWithPassword|lookup|sendOobCode|delete)")
                    && backupKey.equals(url.getQueryParameter("key"));
        }        if ("securetoken.googleapis.com".equals(url.getHost())) {
            return ("POST".equals(method) || "OPTIONS".equals(method))
                    && path.equals("/v1/token") && backupKey.equals(url.getQueryParameter("key"));
        }
        if (!"firestore.googleapis.com".equals(url.getHost())) return false;
        String database = "/v1/projects/" + backupProject + "/databases/(default)";
        if (path.equals(database + "/documents:commit")) {
            return "POST".equals(method) || "OPTIONS".equals(method);
        }
        String base = database + "/documents/familyBackups/";
        return path.startsWith(base)
                && path.substring(base.length()).matches("[a-zA-Z0-9_-]{1,128}/slots/[1-6]")
                && ("GET".equals(method) || "OPTIONS".equals(method));
    }

    private void openExternalLink(String value){
        if(value==null)return;
        Uri u=Uri.parse(value);String h=u.getHost();
        boolean allowedTikTok = "www.tiktok.com".equals(h) && "/@kokab_fodool".equals(u.getPath());
        boolean youtube = "www.youtube.com".equals(h) || "youtube.com".equals(h)
                || "m.youtube.com".equals(h) || "youtu.be".equals(h);
        boolean plusContact = "wa.me".equals(h) && "/971505918238".equals(u.getPath());
        boolean allowedHost = "kokabfodool.com".equals(h) || youtube
                || "www.instagram.com".equals(h) || plusContact || allowedTikTok;
        if (!"https".equals(u.getScheme()) || u.getUserInfo() != null
                || (u.getPort() != -1 && u.getPort() != 443) || !allowedHost) return;
        String current = web.getUrl();
        boolean ar = current == null || !Uri.parse(current).getPath().startsWith("/en/");
        if (youtube) {
            launchExternalLink(u, ar);
            return;
        }
        Random random = new Random();
        int a = plusContact ? 2 + random.nextInt(4) : 12 + random.nextInt(18);
        int b = plusContact ? 1 + random.nextInt(4) : 12 + random.nextInt(18);
        int expected = plusContact ? a + b : a * b;
        String question = a + (plusContact ? " + " : " × ") + b;
        EditText answer = new EditText(this);
        answer.setInputType(InputType.TYPE_CLASS_NUMBER);
        answer.setHint(ar ? "الإجابة" : "Answer");
        AlertDialog gate = new AlertDialog.Builder(this)
                .setTitle(ar ? "للأهل" : "For parents")
                .setMessage((ar ? "لفتح رابط خارج كوكب فضول، أدخل ناتج " : "To open a link outside Kawkab Fudool, enter the answer to ")
                        + question)
                .setView(answer)
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton(ar ? "فتح الرابط" : "Open link", null)
                .create();
        gate.setOnShowListener(dialog -> gate.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String digits = answer.getText().toString().trim();
            try {
                if (Integer.parseInt(digits) != expected) throw new NumberFormatException();
            } catch (NumberFormatException error) {
                answer.setError(ar ? "أعد المحاولة" : "Try again");
                return;
            }
            gate.dismiss();
            launchExternalLink(u, ar);
        }));
        gate.show();
    }

    private void launchExternalLink(Uri uri, boolean arabic) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (android.content.ActivityNotFoundException error) {
            Toast.makeText(this, arabic ? "لا يمكن فتح الرابط" : "Unable to open link", Toast.LENGTH_SHORT).show();
        }
    }
    static void padForSystemBars(View view) {
        if (Build.VERSION.SDK_INT < 35) return;
        view.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets safe = insets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsets.CONSUMED;
        });
    }
    private boolean allowedPage(String p){
        if(p==null)return false;
        return p.equals("/")||p.equals("/en/")||p.matches("^/(en/)?(play-app|games|app|privacy|terms|faq|stories)(/.*)?$");
    }
    private static WebResourceResponse error(int code,String message){
        return new WebResourceResponse("text/plain","UTF-8",code,message,Collections.emptyMap(),new ByteArrayInputStream(message.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
    private WebResourceResponse local(Uri u,Map<String,String> headers){
        String p=u.getPath();if(p==null||p.contains("..")||p.contains("\\")||p.indexOf('\0')>=0)return error(403,"Blocked");
        if(p.endsWith("/"))p+="index.html";if(p.startsWith("/"))p=p.substring(1);
        if(!(p.startsWith("assets/")||allowedPage("/"+p.replace("index.html",""))||p.equals("manifest.webmanifest")))return error(404,"Not Found");
        String mime=mime(p);String encoding=mime.startsWith("text/")||mime.contains("javascript")||mime.contains("json")||mime.contains("svg")?"UTF-8":null;
        try{
            InputStream stream=getAssets().open("site/"+p);
            Map<String,String> response=new HashMap<>();response.put("Cache-Control","no-store");response.put("Accept-Ranges","bytes");
            String range=null;for(Map.Entry<String,String> h:headers.entrySet())if(h.getKey().equalsIgnoreCase("range"))range=h.getValue();
            if(range!=null&&range.matches("bytes=\\d*-\\d*")){
                ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[8192];int read;while((read=stream.read(buf))!=-1)out.write(buf,0,read);stream.close();byte[] data=out.toByteArray();
                String[] pair=range.substring(6).split("-",-1);int start=pair[0].isEmpty()?Math.max(0,data.length-Integer.parseInt(pair[1])):Integer.parseInt(pair[0]);int end=pair[0].isEmpty()||pair[1].isEmpty()?data.length-1:Math.min(data.length-1,Integer.parseInt(pair[1]));
                if(start<0||start>=data.length||end<start)return error(416,"Range Not Satisfiable");
                response.put("Content-Range","bytes "+start+"-"+end+"/"+data.length);response.put("Content-Length",String.valueOf(end-start+1));
                return new WebResourceResponse(mime,encoding,206,"Partial Content",response,new ByteArrayInputStream(data,start,end-start+1));
            }
            return new WebResourceResponse(mime,encoding,200,"OK",response,stream);
        }catch(Exception e){return error(404,"Not Found");}
    }
    private static String mime(String p){
        if(p.endsWith(".html"))return "text/html";if(p.endsWith(".js"))return "application/javascript";if(p.endsWith(".css"))return "text/css";
        if(p.endsWith(".svg"))return "image/svg+xml";if(p.endsWith(".webp"))return "image/webp";if(p.endsWith(".png"))return "image/png";if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg";
        if(p.endsWith(".mp3"))return "audio/mpeg";if(p.endsWith(".wav"))return "audio/wav";if(p.endsWith(".ogg"))return "audio/ogg";if(p.endsWith(".woff2"))return "font/woff2";if(p.endsWith(".json")||p.endsWith(".webmanifest"))return "application/json";return "application/octet-stream";
    }
    private void navigateBack() {
        String current = web.getUrl();
        if (current != null) {
            Uri uri = Uri.parse(current);
            String path = uri.getPath();
            if (host.equals(uri.getHost()) && path != null && path.matches("^/(en/)?games/[^/]+/.*$")) {
                // A game is a child of the app's game library, not an arbitrary browser-history entry.
                // Reload the library to avoid restoring a stale WebView accessibility tree and scroll offset.
                returningFromGame = true;
                web.loadUrl("https://" + host + (path.startsWith("/en/") ? "/en" : "") + "/play-app/#v5-games");
                return;
            }
        }
        if (web.canGoBack()) web.goBack();
        else finish();
    }

    @Override public void onBackPressed() {
        navigateBack();
    }
    @Override protected void onSaveInstanceState(Bundle out){web.saveState(out);super.onSaveInstanceState(out);}
    @Override protected void onPause(){super.onPause();device.stopVoice();web.onPause();}
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        device.onActivityResult(request,result,data);
    }
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(device!=null)device.close();if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
