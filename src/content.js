export const moods = [
  { id: 'all', label: 'Hepsi', symbol: '✳' },
  { id: 'calm', label: 'Biraz huzur', symbol: '◡' },
  { id: 'dream', label: 'Biraz hayal', symbol: '☾' },
  { id: 'smile', label: 'Biraz tebessüm', symbol: '☺' },
  { id: 'thought', label: 'Biraz düşünce', symbol: '◈' },
];

export const daily = {
  quote: 'Bazen hiçbir yere yetişmemek, kendine yetişmektir.',
  quoteCredit: 'Sofra notu · Özgün metin',
  songTitle: 'Akşam Aralığı',
  songArtist: 'Sofra Sessions',
  artwork: 'moon',
};

export const artworks = [
  {
    id: 'moon', title: 'Ayın altında bir sandalye', mood: 'dream', tag: 'SÜRREAL BİR MOLA',
    image: '/images/moon-terrace.webp', alt: 'Denize bakan kemerli bir terasta dolunay ve boş bir sandalye, sürreal yağlıboya',
    credit: 'Sofra Art · Yapay zekâ ile üretilmiş özgün çalışma', source: null,
    description: 'Bazı yerler gitmek için değil, bir anlığına oradaymış gibi hissetmek için vardır. Ay biraz fazla yakın, sandalye tam sana göre. Oturmak için bir sebep bulmana gerek yok.',
    question: 'Bu sandalyeye otursan aklından geçen ilk şey ne olurdu?',
    ratio: 'tall',
  },
  {
    id: 'lake', title: 'Hiç acelemiz yok', mood: 'calm', tag: 'SESSİZ YERLER',
    image: '/images/quiet-lake.jpg', alt: 'Dingin gölde dağların ve küçük ahşap evin yansıması',
    credit: 'Fotoğraf seçkisi · Unsplash', source: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e',
    description: 'Suyun üzerinde tek bir bildirim yok. Birkaç nefes boyunca yalnızca çizgilere, renklere ve yansımaya bak. Bugünlük burası da küçük bir kaçamak sayılır.',
    question: 'Yanında bir kitap mı götürürdün, bir arkadaş mı?', ratio: 'short',
  },
  {
    id: 'wanderer', title: 'Manzaranın karşısında', mood: 'thought', tag: 'SANATA YAKINDAN',
    image: '/images/wanderer.webp', alt: 'Caspar David Friedrich’in sis denizine bakan gezgin tablosu',
    credit: 'Caspar David Friedrich · Sis Denizi Üzerindeki Gezgin, yaklaşık 1818 · Kamu malı',
    source: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg',
    description: 'Bir insan, bir manzara ve aralarında söylenmemiş bir şey. Arkası dönük figürün yüzünü göremediğimiz için belki de biraz kendimizi görüyoruz. Bu, Sofra’nın eser üzerine kişisel okuması.',
    question: 'Sence bu manzara insana yalnızlık mı hissettiriyor, özgürlük mü?', ratio: 'tall',
  },
  {
    id: 'cat', title: 'Bugünkü planım: plan yapmamak', mood: 'smile', tag: 'CİDDİYETE KISA BİR ARA',
    image: '/images/cat.jpg', alt: 'Rahatça uzanan, meraklı bakışlı bir kedi',
    credit: 'Fotoğraf seçkisi · Unsplash', source: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
    description: 'Hayatına hâkimmiş gibi duran ama muhtemelen bir sonraki öğününü düşünen bir kedi. Bugün verimlilik konusunda ondan ilham almayı seçiyoruz.',
    question: 'Bugünkü enerjini bir kelimeyle anlatsan?', ratio: 'short',
  },
  {
    id: 'forest', title: 'Şehirden bir adım uzakta', mood: 'calm', tag: 'YEŞİLE KARIŞ',
    image: '/images/forest.jpg', alt: 'Uzun ağaçların arasından süzülen gün ışığı',
    credit: 'Fotoğraf seçkisi · Unsplash', source: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
    description: 'Her şey aynı anda konuşurken ağaçların arasında bir boşluk hayal et. Bir yere varmak için değil, yürümek için çıkılmış bir yol.',
    question: 'Şehrin içinde sana nefes aldıran bir köşe var mı?', ratio: 'short',
  },
  {
    id: 'sky', title: 'Biraz yukarı bak', mood: 'dream', tag: 'GECEYE BİR NOT',
    image: '/images/night-sky.jpg', alt: 'Yıldızlı gece göğünün altında karla kaplı dağ zirvesi',
    credit: 'Fotoğraf seçkisi · Unsplash', source: 'https://images.unsplash.com/photo-1519681393784-d120267933ba',
    description: 'Gün boyunca bakılacak o kadar çok ekran var ki gökyüzünü unutabiliyoruz. Bu akşam kendine küçük bir pencere aç. Cevabı olmayan şeylere de yer kalsın.',
    question: 'Gece sana en çok hangi şarkıyı hatırlatıyor?', ratio: 'tall',
  },
];

export const readings = [
  {
    id: 'slow', category: 'KENDİNE BİR ALAN', title: 'Yavaşlamak da bir yere varmaktır.',
    intro: 'Her boşluğu doldurmadan geçen birkaç dakika üzerine.', time: '2 dk', image: '/images/quiet-lake.jpg',
    paragraphs: [
      'Sabahın ilk dakikasından akşamın son mesajına kadar bir şeylere yetişiyoruz. Bir işi bitirince diğerini düşünüyor, dinlenirken bile dinlenmeyi doğru yapıp yapmadığımızı tartıyoruz. Bazen en yorucu şey, durduğumuzda bile kendimizden bir sonuç beklemek.',
      'Küçük bir deneme yap: Önündeki birkaç dakikadan bir şey elde etmeye çalışma. Bir şarkıyı sonuna kadar dinle. Pencereden geçen ışığın yer değiştirmesini izle. Bir görsele bak ve onu anlamak zorunda olmadığını hatırla.',
      'Böyle anlar sana büyük bir cevap vermeyebilir. Yine de günün içinde sana ait küçük bir yer açarlar. Bugün o yer, bu sayfa olabilir. Sonra kalkıp hayatına devam edersin; belki biraz daha kendi hızında.',
    ],
  },
  {
    id: 'look', category: 'SANATA BAKMAK', title: 'Bir resmi anlamak zorunda mıyız?',
    intro: 'Bazen sadece bakmak, yeterince iyi bir başlangıçtır.', time: '1 dk', image: '/images/wanderer.webp',
    paragraphs: [
      'Bir resmin karşısında durunca aklımıza hemen doğru soruyu bulmak geliyor: Sanatçı ne anlatmış? Bu renk neyi simgeliyor? Oysa ilk karşılaşmada bunların hiçbirini bilmek zorunda değiliz.',
      'Önce gözünün nereye gittiğini fark et. Hangi renk seni tutuyor, hangi köşe sessiz kalıyor? Sonra kendi anıların devreye girsin. Bir resmin sana hatırlattığı yer, sanatçının hiç gitmediği bir yer de olabilir.',
      'Eserin hikâyesini öğrenmek bu karşılaşmayı büyütebilir. Ama ilk izlenimini bir sınav cevabı gibi düzeltmen gerekmez. Bazen “burada biraz kalmak istiyorum” demek, başlangıç için yeterlidir.',
    ],
  },
  {
    id: 'small', category: 'GÜNLÜK HAYAT', title: 'Küçük şeylerin tarafını tutmak.',
    intro: 'Soğumadan içilen bir kahve ve beklenmedik bir gülümseme.', time: '2 dk', image: '/images/forest.jpg',
    paragraphs: [
      'Günün güzel geçmesi için bazen büyük bir olay bekliyoruz. Beklediğimiz haber, uzun zamandır planlanan yolculuk, tamamlanan iş. Bunları beklerken arada olanları kolayca kaçırabiliyoruz.',
      'Bir kedinin güneşte bulduğu kusursuz yer. Sevdiğin şarkının rastgele başlaması. Birinin kapıyı sana tutması. Küçük şeylerin hayatı değiştirdiği iddiasında değiliz; sadece günün içinde onlara da bir sandalye ayırmak istiyoruz.',
      'Bugün fark ettiğin küçük bir şeyi düşün. Kimseye anlatmaya değmez gibi gelen bir şey de olabilir. Yine de sen fark ettin. Belki güzel bir günü başlatan şey, tam olarak budur.',
    ],
  },
];

export const quizQuestions = [
  { title: 'Şu an bir kapı açılsa…', options: [
    { text: 'Sessiz bir gölün kıyısına çıksın.', mood: 'calm' },
    { text: 'Yerçekiminin pek işlemediği bir yere.', mood: 'dream' },
    { text: 'Arkadaşlarımın güldüğü bir odaya.', mood: 'smile' },
    { text: 'Pencereli, kitap dolu bir köşeye.', mood: 'thought' },
  ] },
  { title: 'Bugünün sesini seç.', options: [
    { text: 'Ağaçların arasından geçen rüzgâr.', mood: 'calm' },
    { text: 'Uzaklardan gelen tuhaf bir melodi.', mood: 'dream' },
    { text: 'Tutamadığım bir kahkaha.', mood: 'smile' },
    { text: 'Bir plak, biraz da sessizlik.', mood: 'thought' },
  ] },
  { title: 'Yanına tek bir şey alıyorsun.', options: [
    { text: 'Hiçbir şey. Ellerim boş olsun.', mood: 'calm' },
    { text: 'Henüz çizilmemiş bir harita.', mood: 'dream' },
    { text: 'Saçma ama çok sevdiğim bir oyuncak.', mood: 'smile' },
    { text: 'Kenarlarına not aldığım bir kitap.', mood: 'thought' },
  ] },
];

export const quizResults = {
  calm: { title: 'Bugün biraz göl kıyısısın.', text: 'Az ses, geniş bir manzara, telaşsız bir saat. Kendine sakin bir köşe ayırmak iyi gelebilir.', art: 'lake' },
  dream: { title: 'Bugün ayın biraz yakınında.', text: 'Tanıdık şeylere başka bir açıdan bakmak istiyorsun. Hayaline küçük bir kapı aralık kalsın.', art: 'moon' },
  smile: { title: 'Bugün ciddiyete küçük bir ara.', text: 'Biraz oyun, biraz absürtlük, sebepsiz bir tebessüm. Hayatın komik tarafına bir sandalye çek.', art: 'cat' },
  thought: { title: 'Bugün manzaranın karşısındasın.', text: 'Sorulara yer var; hemen cevap bulmak zorunda değilsin. Bir resim, bir yazı, biraz kendinle kalmak.', art: 'wanderer' },
};
