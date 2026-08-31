# RDGrup İş Takip Paneli

Panelin **Medya** bölümündeki **Rapor Oluştur** sayfasından firma eklenebilir, aylık rapor hazırlanabilir ve PDF çıktısı alınabilir.

## Meta bağlantısı

Meta uygulama şifresi site dosyalarına yazılmaz. GitHub deposu Vercel'e bağlıyken Vercel'de **Settings > Environment Variables** alanına şu değişkenleri ekleyin:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` — örnek: `https://site-adiniz.vercel.app/api/meta/callback`
- `META_GRAPH_VERSION` — `v25.0`

Meta for Developers uygulamasında **Valid OAuth Redirect URIs** alanına `META_REDIRECT_URI` ile aynı adresi ekleyin. Ardından Vercel'de projeyi yeniden yayınlayın.

Bağlantı tamamlandığında seçili firmaya ait aylık gönderiler, takipçi bilgisi ve profil görünümündeki son 12 gönderi **Meta'dan getir** düğmesiyle rapora alınır.
