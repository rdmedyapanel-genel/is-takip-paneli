# RDGrup İş Takip Paneli

Panelin **Medya** bölümündeki **Rapor Oluştur** sayfasından rapor firmaları yönetilebilir, aylık rapor hazırlanabilir ve PDF çıktısı alınabilir. Rapor firmaları normal iş takip firmalarından ayrı bir listede tutulur; iki alan birbirine karışmaz.

## Meta bağlantısı

Meta uygulama şifresi site dosyalarına yazılmaz. GitHub deposu Vercel'e bağlıyken Vercel'de **Settings > Environment Variables** alanına şu değişkenleri ekleyin:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` — örnek: `https://site-adiniz.vercel.app/api/meta/callback`
- `META_GRAPH_VERSION` — `v25.0`

Meta for Developers uygulamasında **Valid OAuth Redirect URIs** alanına `META_REDIRECT_URI` ile aynı adresi ekleyin. Ardından Vercel'de projeyi yeniden yayınlayın.

Firma eklerken **Kaydet ve Meta Hesabı Seç** düğmesiyle doğru Instagram hesabı firmaya bir kez eşleştirilir. Mevcut firmaların bağlantısı ve reklam hesabı **Firmaları Düzenle** bölümünden değiştirilebilir. Rapor sayfasında tekrar hesap seçmek gerekmez.

Bağlantı tamamlandığında seçili firmaya ait aylık gönderiler, takipçi bilgisi, organik istatistikler ve profil görünümündeki son 12 gönderi **Meta'dan verileri getir** düğmesiyle rapora alınır. Reklam izni varsa her reklamın kapak görseli ve ayrı performans değerleri PDF'de kartlar halinde gösterilir; reklam detaylarından sonra hesap düzeyindeki aylık toplam sayfası eklenir.

Reklam sonuçları ve reklam kapakları iki aşamada alınır. Önce reklamların harcama, erişim, gösterim, tıklama ve başlangıç tarihleri hızlıca rapora eklenir; creative görselleri daha sonra bağımsız biçimde tamamlanır. Böylece kapak servisi gecikse bile reklam kartları kaybolmaz.

Reklam kapakları creative kimliği üzerinden yüksek çözünürlüklü görsel, bağlı Instagram medyası, video thumbnail'ı ve gönderi görseli sırasıyla denenerek alınır. Tarayıcıda ayrıca reklam adı ile o ayın ve son 12 gönderinin açıklaması eşleştirilir. Metin eşleşmesi bulunamazsa reklam setinin başlangıç tarihi veya reklamın oluşturulma tarihi, Instagram gönderisinin yayın tarihiyle eşleştirilir. Güncellemeden sonra eski taslaktaki reklam kartlarını yenilemek için **Meta'dan verileri getir** düğmesine yeniden basın.

Bulunan Meta kapakları, profil fotoğrafı ve gönderi görselleri süreli CDN bağlantılarının PDF ekranında engellenmemesi için imzalı `/api/meta/image-proxy` uç noktası üzerinden aynı site görseline dönüştürülür. Proxy çalışmazsa özgün Meta adresi otomatik olarak ikinci seçenek şeklinde denenir. Proxy yalnızca Meta/Facebook/Instagram görsel alan adlarına izin verir ve `META_APP_SECRET` ile imzalanır.

Gönderiler, profil görünümü, organik istatistikler ve reklamlar birbirinden bağımsız içe aktarılır. Reklam servisi gecikse veya hata verse bile alınmış gönderiler ve istatistikler hemen ekrana uygulanır, yerel taslağa kaydedilir ve silinmez.
