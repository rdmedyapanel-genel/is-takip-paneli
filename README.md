# RDGrup İş Takip Paneli

Panelin **Medya** bölümündeki **Rapor Oluştur** sayfasından rapor firmaları yönetilebilir, aylık rapor hazırlanabilir ve PDF çıktısı alınabilir. Rapor firmaları normal iş takip firmalarından ayrı bir listede tutulur; iki alan birbirine karışmaz.

PDF kaydedilirken önerilen dosya adı firma ve rapor dönemine göre otomatik hazırlanır. Örneğin Gülçimen Aspava Mustafa Kemal firmasının Haziran 2025 raporu `Gülçimen Aspava Mustafa Kemal 2025 - Haziran Ayı Aylık Rapor.pdf` adıyla önerilir.

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

Reklam kapakları creative kimliği üzerinden yüksek çözünürlüklü görsel, bağlı Instagram medyası, video thumbnail'ı ve gönderi görseli sırasıyla denenerek alınır. Meta creative içindeki gerçek reklam açıklaması (`body`, gönderi mesajı ve dinamik reklam metinleri) alınarak Instagram gönderisinin açıklamasıyla öncelikli eşleştirilir. Reklam açıklaması mevcutsa tarih eşleştirmesi yapılmaz; böylece reklam ve gönderi farklı tarihlerde yayınlandığında yanlış kapak seçilmez. Açıklama alınamazsa reklam adı ve son seçenek olarak tarih denenir. Güncellemeden sonra eski taslaktaki reklam kartlarını yenilemek için **Meta'dan verileri getir** düğmesine yeniden basın.

Rapor ayındaki ve son 12 gönderide eşleşmeyen reklam kapakları için Instagram hesabının son 300 gönderi/Reels arşivi ayrıca taranır. Bu tarama yalnızca kapağı eksik reklamlar bulunduğunda çalışır; eski aylarda yayınlanıp daha sonra reklama verilen videolar da açıklama üzerinden bulunabilir.

Bulunan Meta kapakları, profil fotoğrafı ve gönderi görselleri süreli CDN bağlantılarının PDF ekranında engellenmemesi için imzalı `/api/meta/image-proxy` uç noktası üzerinden aynı site görseline dönüştürülür. Proxy çalışmazsa özgün Meta adresi otomatik olarak ikinci seçenek şeklinde denenir. Proxy yalnızca Meta/Facebook/Instagram görsel alan adlarına izin verir ve `META_APP_SECRET` ile imzalanır.

Gönderiler, profil görünümü, organik istatistikler ve reklamlar birbirinden bağımsız içe aktarılır. Reklam servisi gecikse veya hata verse bile alınmış gönderiler ve istatistikler hemen ekrana uygulanır, yerel taslağa kaydedilir ve silinmez.

## Google Ads bağlantısı

Google reklamı kullanılan firmalar için **Firmaları Düzenle > Düzenle > Google Ads’e bağlan** adımı kullanılır. Google izni tamamlandığında erişilebilen reklam hesapları listelenir ve doğru hesap firmaya bir kez kaydedilir. Ardından rapor ekranındaki **Google Ads verilerini getir** düğmesi seçili ayın kampanya sonuçlarını alır.

Google Ads bağlantısı için Google Cloud projesinde **Google Ads API** etkinleştirilmeli, OAuth istemcisi **Web application** türünde oluşturulmalı ve OAuth izin ekranına `https://www.googleapis.com/auth/adwords` kapsamı eklenmelidir. Google Ads yönetici hesabındaki API Center bölümünden ayrıca bir geliştirici anahtarı gerekir.

Google Cloud OAuth istemcisindeki **Authorized redirect URIs** alanına aşağıdaki adres eklenir:

`https://site-adiniz.vercel.app/api/google-ads/callback`

Vercel'de **Settings > Environment Variables** alanına şu değişkenler eklenir:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REDIRECT_URI` — örnek: `https://site-adiniz.vercel.app/api/google-ads/callback`
- `GOOGLE_ADS_API_VERSION` — `v25`

OAuth izin ekranı **Testing** durumundaysa Google yenileme anahtarı yedi gün sonra sona erebilir. Sürekli kullanım için uygulamayı uygun kullanıcı türü ve yayın durumuyla yapılandırın. İstemci gizli anahtarı ve geliştirici anahtarı GitHub dosyalarına yazılmaz; yalnızca Vercel ortam değişkenlerinde tutulur.

Google Ads API’den kampanya adı, kampanya türü, harcama, gösterim, tıklama ve dönüşüm bilgileri alınır. Panelde kampanya bazında gösterilir; toplam harcama, gösterim, tıklama, dönüşüm, ortalama tıklama maliyeti ve en yüksek harcamalı kampanyalar PDF’in son sayfasına otomatik eklenir. Google Ads bağlantısı olmayan firmaların raporuna bu sayfa eklenmez.

## Genel Performans Özeti ve en iyi içerikler

PDF'nin kapaktan sonraki ilk sayfası, firma için seçilen renge uyarlanan editoryal bir **Genel Performans Özeti** olarak hazırlanır. Bu sayfada toplam erişim, etkileşim, takipçi sayısı, paylaşılan içerik, etkileşim dağılımı ve otomatik kısa değerlendirme birlikte gösterilir.

**Meta'dan verileri getir** işlemi seçili ayın gönderi bazlı erişim ve etkileşim istatistiklerini de alır. Gönderiler önce erişime, erişim yoksa görüntülenme ve etkileşime göre sıralanır; en güçlü üç içerik kapak görseli, açıklaması, erişimi ve etkileşimiyle **En İyi İçerikler** alanına otomatik eklenir. Bir içerik satırına tıklandığında ilgili Instagram gönderisi açılır.

## Reklam harcamalarında KDV

Meta Reklam API'sinden alınan harcama ham, KDV hariç değer olarak taslakta saklanır. Paneldeki reklam kartları ve PDF raporundaki reklam detayları ile toplam harcama gösterilirken bu tutara otomatik olarak **%20 KDV** eklenir. Böylece raporda Meta'nın hesaptan çekeceği KDV dahil tutar görünür; veri tekrar çekildiğinde KDV ikinci kez eklenmez.

## PDF tasarım ve okunabilirlik

Kapak, Genel Performans Özeti ile aynı editoryal ve yumuşak görsel dilde hazırlanır. Firma logosu büyük, beyaz ve firma renginden üretilen koyu bir yüzey üzerinde gösterilir. Firma için açık bir renk seçilmiş olsa bile başlık ve bilgi metinlerinde otomatik koyulaştırılmış güvenli bir ton kullanılır.

Tüm PDF sayfalarında başlıklar, açıklamalar, istatistik değerleri, reklam bilgileri, Instagram hesap bilgileri ve alt bilgiler büyütülmüş ve kontrastı artırılmıştır. Daha büyük içerik satırlarının çakışmaması için paylaşım listeleri sayfa başına en fazla 12 kayıtla bölünür.

Etkileşim dağılımı grafiğinde firma renginin çok koyu, ana, orta-açık ve çok açık dört ayrı kademesi kullanılır. Aynı renkler grafik halkasında ve açıklama işaretlerinde birlikte gösterildiği için beğeni, yorum, kaydetme ve paylaşım değerleri birbirinden kolayca ayırt edilir.

PDF motorlarının büyük dairesel geçişleri keskin renk bandı şeklinde basmasını önlemek için kapak, performans özeti ve standart sayfalardaki zeminler tek tonlu ve yumuşak doğrusal geçişlere dönüştürülmüştür. Firma rengi korunur; arka planda mor veya gri ikinci bir renk üretilmez.

Kapakta soldaki dikey şerit kullanılmaz. Kapağın tamamı firma renginden üretilen, beyaz metin ve logonun okunmasını sağlayan koyu bir tona dönüşür. Logo kutusuz ve daha büyük gösterilir; ince dairesel çizgiler ile alt bölümdeki paralel çizgiler kapağa sade bir geometrik hareket kazandırır.
