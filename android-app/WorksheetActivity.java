package com.kokabfodool.shell;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;

public final class WorksheetActivity extends Activity {
    private PdfRenderer renderer;
    private Bitmap bitmap;
    private ImageView image;
    private TextView status;
    private Button previous;
    private Button next;
    private int index;
    private boolean arabic;
    private File temporary;

    static boolean validPath(String path) {
        return path != null && (path.matches("/print/(ar|en)/(arabic-letter-sounds|arabic-letters|arabic-numbers|count-the-stars|english-abc-sheet|english-letters|english-numbers)\\.pdf")
                || path.matches("/print/worksheets/(5-6|7-8|9-10)/worksheet-\\d{2}\\.pdf"));
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        String path = getIntent().getStringExtra("worksheet");
        if (!validPath(path)) {
            finish();
            return;
        }
        arabic = path.startsWith("/print/ar/");
        index = state == null ? 0 : state.getInt("page");
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setBackgroundColor(Color.WHITE);
        if (arabic) content.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        MainActivity.padForSystemBars(content);
        Button back = new Button(this);
        back.setText(arabic ? "رجوع إلى التطبيق" : "Back to the app");
        back.setOnClickListener(view -> finish());
        content.addView(back);
        LinearLayout controls = new LinearLayout(this);
        previous = new Button(this);
        previous.setText(arabic ? "السابق" : "Previous");
        previous.setOnClickListener(view -> showPage(index - 1));
        next = new Button(this);
        next.setText(arabic ? "التالي" : "Next");
        next.setOnClickListener(view -> showPage(index + 1));
        status = new TextView(this);
        status.setPadding(12, 8, 12, 8);
        controls.addView(previous);
        controls.addView(next);
        content.addView(controls);
        content.addView(status);
        ScrollView scroll = new ScrollView(this);
        image = new ImageView(this);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        scroll.addView(image, new ScrollView.LayoutParams(-1, -2));
        content.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(content);

        try {
            temporary = File.createTempFile("worksheet-", ".pdf", getCacheDir());
            try (InputStream input = getAssets().open("site" + path);
                 FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
            ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(temporary, ParcelFileDescriptor.MODE_READ_ONLY);
            try {
                renderer = new PdfRenderer(descriptor);
            } catch (IOException | RuntimeException error) {
                descriptor.close();
                throw error;
            }
            showPage(index);
        } catch (IOException | RuntimeException error) {
            previous.setEnabled(false);
            next.setEnabled(false);
            status.setText(arabic ? "تعذر فتح ورقة العمل." : "Could not open this worksheet.");
        }
    }

    private void showPage(int requested) {
        if (renderer == null || requested < 0 || requested >= renderer.getPageCount()) return;
        try (PdfRenderer.Page page = renderer.openPage(requested)) {
            int width = Math.min(1400, getResources().getDisplayMetrics().widthPixels);
            int height = Math.min(2100, Math.round(width * (float) page.getHeight() / page.getWidth()));
            Bitmap rendered = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            rendered.eraseColor(Color.WHITE);
            page.render(rendered, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            image.setImageBitmap(rendered);
            if (bitmap != null) bitmap.recycle();
            bitmap = rendered;
        }
        index = requested;
        status.setText((arabic ? "صفحة " : "Page ") + (index + 1) + " / " + renderer.getPageCount());
        previous.setEnabled(index > 0);
        next.setEnabled(index + 1 < renderer.getPageCount());
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        out.putInt("page", index);
        super.onSaveInstanceState(out);
    }

    @Override protected void onDestroy() {
        if (renderer != null) renderer.close();
        if (image != null) image.setImageDrawable(null);
        if (bitmap != null) bitmap.recycle();
        if (temporary != null) temporary.delete();
        super.onDestroy();
    }
}
