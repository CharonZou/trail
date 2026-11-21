import type { ChangelogEntry } from "./changelog.js";

export const trEntries: ChangelogEntry[] = [
  {
    version: "1.0.4",
    date: "2026-11-20",
    highlights: [
      "Varlık Merkezi kenar çubuğuna birincil hedef olarak eklendi; Genel Bakış, Bellek, Beceriler ve Alt Ajanlar ayrı ayar yolları yerine tek bir çalışma alanında birleşti.",
      "Genel Bakış, yerleşik ve kullanıcı varlıklarını, genel ve proje kapsamlarını ayırır; sekmelere geçmeden önce geçerli bellek ve yetenek sayılarını özetler.",
      "Bellek; proje veya proje grubu seçimi, arama, hızlı kayıt oluşturma, düzenleme ve kaydetmeyi destekler ve mevcut proje belleği penceresiyle aynı ana bilgisayar yönetimli veriyi kullanır.",
      "Paylaşılan bellek düzenleyicisi eski metni yapılandırılmış kayıtlara taşır, kimlikleri ve boş öğeleri normalleştirir; kaydedilmemiş değişiklikler varken proje geçişini engelleyerek taslağı korur.",
      "Beceriler, genel ve proje becerileri için mevcut yetenek yöneticisinin oluşturma, düzenleme, etkinleştirme, içe aktarma, taşıma ve dizin yönetimi işlevlerini salt okunur liste yerine eksiksiz kullanır.",
      "Alt Ajanlar, yerleşik ve kullanıcı ajanlarının tam kataloğunu mevcut oluşturma, düzenleme ve etkinleştirme akışlarıyla sunar; varlık yönetimi artık sayfalara bölünmez.",
      "Ziyaret edilen sekmeler bağlı kalır ve Varlık Merkezi yolu gerektiğinde yüklenir; genel bakışla düzenleyiciler arasında geçiş taslakları silmez veya tüm çalışma alanını yeniden yüklemez.",
      "Sürümlü JSON yedeği, dışa aktarırken yeni bir ana bilgisayar anlık görüntüsü alır; geçerli proje veya grup belleği ile genel ve geçerli proje kapsamındaki kullanıcı becerilerini ve alt ajanlarını içerir.",
      "Yedekler geri yükleme için gereken kullanıcı becerisi ve alt ajan içeriğini içerir, ancak yerleşik belgeleri ve kimlik bilgilerini içermez; işleyicide ikinci bir kalıcı depo oluşturulmaz.",
      "Dokuz arayüz dilinin tamamına yeni metinler, duyarlı düzenler, azaltılmış hareket stilleri ve gezinme, geçiş, yedekleme ile ana bilgisayar sınırları için regresyon testleri eklendi.",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-17",
    highlights: [
      "Ayarlar › Genel › Görünüm pencere düzeni seçeneği sunar: tam pencere tek sürekli çalışma alanını korurken yüzen kart, ana alanı kenar çubuğu zemini üzerinde yuvarlatılmış bir karta taşır.",
      "Yüzen kart modu sağ çalışma panelini de aynı yuvarlatılmış yüzeye katar; panel ayrı bir sütun yerine çalışma alanının parçası olarak görünür.",
      "Ayarlar sayfası da aynı Görünüm bölümünden tam sayfa veya yüzen katman olarak gösterilebilir ve sohbet düzeni tercihini değiştirmez.",
      "Düşünme kaydırıcısı daha net bir başlık, geçerli düzey ve Ctrl+T ipucu, altı duraklı yeşil-mavi geçişli ray ve en yüksek düzeyde akan ışık parçacıkları sunar.",
      "Ctrl+T düşünme düzeylerini doğrudan besteciden değiştirir; model menüsünü açmadan yalnızca klavyeyle model ayarı yapmayı sağlar.",
      "Bestecideki model rozeti her sağlayıcının kendi marka işaretini kullanarak benzer adlı modelleri ayırt etmeyi kolaylaştırır.",
      "Proje klasörleri kenar çubuğundan VS Code, Trae veya IntelliJ IDEA ile açılabilir; düzenleyiciler PATH, yaygın kurulum konumları veya Windows App Paths üzerinden bulunur.",
      "Seçilen düzenleyici yoksa başka bir yürütülebilir dosya tahmin etmek ya da açıklamasız kalmak yerine sorun açıkça bildirilir.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-06",
    highlights: [
      "Her proje kendi çalışma alanı simgesine ve rengine sahip olabilir; bunlar kenar çubuğundaki satırda gösterilerek projelerin tekrarlanan klasör simgesinden daha kolay tanınmasını sağlar.",
      "Proje oluşturma ve düzenleme pencereleri bağımsız bir çalışma alanı dizini anahtarı sunar; dizin yalnızca gerekli olmayan projelerde kapatılabilir.",
      "Dizin kapalıyken @ önerileri dosya listelemez, ancak sohbetlerde daha önce başvurulan yollar normal şekilde çözümlenmeye devam eder.",
      "Ana ekrandaki bestecinin üzerindeki Token kartı son on iki ayın toplamını ve günlük yoğunluk şeridini göstererek etkinlik düzenini görünür kılar.",
      "Aynı kart toplamı modele göre ayırarak son tüketimin hangi modellerde yoğunlaştığını anlamayı kolaylaştırır.",
      "Ayarlar'daki yeni Pencere kartı, işletim sistemi menü çubuğuna gerek kalmadan simge durumuna küçültme ve tam ekran işlemleri sunar.",
      "Mistral, Kimi ve Moonshot dahil daha fazla sağlayıcı listelerde resmi marka işaretlerini gösterir; model yapılandırırken hizmetleri tanımak kolaylaşır.",
      "Uygulama simgesi Windows görev çubuğu ve Alt+Tab geçiş ekranı dahil tüm pencere yüzeylerinde temiz bir marka işareti olarak birleştirildi.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-04",
    highlights: [
      "Trail'in ilk sürümü: projelerin, oturumların, incelemelerin, önizlemelerin ve ajanların aynı kalıcı ortamı paylaştığı, yerel öncelikli bir yapay zekâ ajanı masaüstü çalışma alanı.",
      "Bir IDE eklentisi veya terminal ön yüzü yerine bağımsız uygulama olarak çalışır; çalışma alanı verileri kullanıcının kendi bilgisayarında kalır.",
      "Bulut modelleri, yerel modeller, özel uç noktalar ve uyumlu API'ler aynı iş akışını kullanır; sağlayıcı değiştirmek çalışma alanını yeniden kurmayı gerektirmez.",
      "Sohbetler tur başına token kullanımı ve süreyle kaydedilir; geri dönüldüğünde hem döküm hem de yürütme bağlamı korunur.",
      "Bir projedeki paralel sohbetlerin her biri kendi Git worktree alanında yalıtılır ve eşzamanlı görevler arasındaki değişiklik çakışmaları azaltılır.",
      "İşler alt ajanlara devredilebilir ve birden çok çalışan oturumu paralel koordine edilebilir; ana sohbet merkezi koordinasyon yüzeyi olarak kalır.",
      "Eklentiler paneller, görünümler, araçlar, MCP sunucuları, temalar ve arka plan hizmetleri ekleyerek çalışma alanını kademeli olarak genişletebilir.",
      "macOS, Windows ve Linux'ta üç masaüstü platformunda da aynı yerel öncelikli ajan iş akışını sunar.",
    ],
  },
];
