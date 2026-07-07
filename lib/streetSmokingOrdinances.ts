// 各市区町村の路上喫煙防止条例の概要。
// ウェブ検索で確認できた内容のみを掲載し、確認できなかった市（大垣市・津市・富士市・掛川市等）は含めない。
// 過料額や区域は変更されることがあるため、必ず出典（公式ページ）へのリンクを添えて確認を促す。
// key: `${prefecture}|${city}`（venuesテーブルのprefecture/cityと同じ表記に合わせること）
export interface StreetSmokingOrdinance {
  ordinanceName: string;
  prohibitedAreas: string;
  fine: string;
  sourceUrl: string;
}

const NAGOYA_ORDINANCE: StreetSmokingOrdinance = {
  ordinanceName: "安心・安全で快適なまちづくりなごや条例",
  prohibitedAreas: "名古屋駅・栄・金山・藤が丘の4地区の路上禁煙地区（区域内の道路上）",
  fine: "過料2,000円",
  sourceUrl: "https://www.city.nagoya.jp/bousai/anzen/1034530/1014489/1014490/1038065.html",
};

const NAGOYA_WARDS = [
  "千種区", "東区", "北区", "西区", "中村区", "中区", "昭和区", "瑞穂区",
  "熱田区", "中川区", "港区", "南区", "守山区", "緑区", "名東区", "天白区",
];

export const STREET_SMOKING_ORDINANCES: Record<string, StreetSmokingOrdinance> = {
  "北海道|札幌市": {
    ordinanceName: "札幌市ポイ捨て等防止条例",
    prohibitedAreas: "大通公園・札幌駅周辺等の喫煙制限区域",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.sapporo.jp/seiso/poisute/index.html",
  },
  "宮城県|仙台市": {
    ordinanceName: "仙台市歩行喫煙等の防止に関する条例",
    prohibitedAreas: "仙台駅前ペデストリアンデッキ・宮城野通等の歩行喫煙防止重点区域（政令市で唯一、罰則なし）",
    fine: "罰則（過料）の規定なし",
    sourceUrl: "https://www.city.sendai.jp/shiminsekatsu/kurashi/anzen/anzen/mewaku/jore.html",
  },
  "埼玉県|さいたま市": {
    ordinanceName: "さいたま市路上喫煙及び空き缶等のポイ捨ての防止に関する条例",
    prohibitedAreas: "大宮・浦和等12駅周辺の路上喫煙禁止区域",
    fine: "過料あり（金額は公式サイト参照）",
    sourceUrl: "https://www.city.saitama.lg.jp/001/009/014/p003040.html",
  },
  "千葉県|千葉市": {
    ordinanceName: "千葉市路上喫煙等及び空き缶等の散乱の防止に関する条例",
    prohibitedAreas: "路上喫煙等・ポイ捨て取締り地区",
    fine: "過料2万円以下",
    sourceUrl: "https://www.city.chiba.jp/kankyo/junkan/haikibutsu/rojoukituenpoisue-boushi.html",
  },
  "神奈川県|横浜市": {
    ordinanceName: "横浜市空き缶等及び吸い殻等の散乱の防止等に関する条例",
    prohibitedAreas: "横浜駅周辺・みなとみらい21・関内等8地区の喫煙禁止地区",
    fine: "過料2,000円",
    sourceUrl: "https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/seiketsu/kitsuen/kinshitiku.html",
  },
  "神奈川県|川崎市": {
    ordinanceName: "川崎市路上喫煙の防止に関する条例",
    prohibitedAreas: "川崎・武蔵小杉・新百合ヶ丘等7駅周辺の重点区域",
    fine: "過料2,000円",
    sourceUrl: "https://www.city.kawasaki.jp/kurashi/category/262-2-4-0-0-0-0-0-0-0.html",
  },
  "神奈川県|相模原市": {
    ordinanceName: "相模原市路上喫煙の防止に関する条例",
    prohibitedAreas: "橋本・相模原・相模大野の3駅周辺（重点禁止地区）＋市内13駅周辺（禁止地区）",
    fine: "過料2,000円（重点禁止地区の命令違反のみ）",
    sourceUrl: "https://www.city.sagamihara.kanagawa.jp/kurashi/1026529/1026549/1026557/1008486.html",
  },
  "新潟県|新潟市": {
    ordinanceName: "新潟市ぽい捨て等及び路上喫煙の防止に関する条例",
    prohibitedAreas: "路上喫煙制限地区",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.niigata.lg.jp/kurashi/gomi/gomi_recycl/seidoannai/poisuteindex/seigen.html",
  },
  "静岡県|静岡市": {
    ordinanceName: "静岡市路上喫煙による被害等の防止に関する条例",
    prohibitedAreas: "呉服町通り・七間町通り・静岡駅北口/南口広場・清水駅前等の禁止地区",
    fine: "過料2,000円",
    sourceUrl: "https://www.city.shizuoka.lg.jp/s9623/s000040.html",
  },
  "静岡県|浜松市": {
    ordinanceName: "浜松市快適で良好な生活環境を確保する条例（市民マナー条例）",
    prohibitedAreas: "市内全域で努力義務（禁止地区の指定なし。政令市20市中、罰則なしは仙台市とここだけ）",
    fine: "罰則（過料）の規定なし",
    sourceUrl: "https://www.city.hamamatsu.shizuoka.jp/kankyou/kaiteki_jorei/index.html",
  },
  "静岡県|沼津市": {
    ordinanceName: "沼津市路上喫煙の規制に関する条例",
    prohibitedAreas: "沼津駅周辺の特別喫煙制限区域",
    fine: "過料の規定は確認できず（悪質・常習違反者は氏名等を公表）",
    sourceUrl: "https://city.numazu.shizuoka.jp/kurashi/sumai/kankyo/rojyokitsuen/index.htm",
  },
  "静岡県|三島市": {
    ordinanceName: "三島市快適な空間を保全するための公共施設における喫煙の防止等に関する条例",
    prohibitedAreas: "道路・公園・河川・駅前広場等の公共施設",
    fine: "過料の規定は確認できず（勧告に従わない場合は氏名等を公表）",
    sourceUrl: "https://www.city.mishima.shizuoka.jp/page/1668.html",
  },
  "岐阜県|岐阜市": {
    ordinanceName: "岐阜市まちを美しくする条例",
    prohibitedAreas: "JR岐阜駅前広場・柳ヶ瀬・市役所周辺等の路上喫煙禁止区域",
    fine: "過料2,000円",
    sourceUrl: "https://www.city.gifu.lg.jp/kurashi/seikatukankyo/1002916/1002918/1002919.html",
  },
  "三重県|桑名市": {
    ordinanceName: "桑名市路上喫煙の防止に関する条例",
    prohibitedAreas: "桑名駅周辺の路上喫煙禁止区域",
    fine: "過料2万円以下",
    sourceUrl: "https://www.city.kuwana.lg.jp/hokeniryo/kenkou/kenkou/24-65934-229.html",
  },
  "三重県|四日市市": {
    ordinanceName: "四日市市路上喫煙の禁止に関する条例",
    prohibitedAreas: "路上喫煙禁止区域",
    fine: "過料2万円以下（指導に従わない場合は2,000円を徴収）",
    sourceUrl: "https://www.city.yokkaichi.lg.jp/www/contents/1001000003679/index.html",
  },
  "愛知県|豊橋市": {
    ordinanceName: "豊橋市快適なまちづくりを推進する条例",
    prohibitedAreas: "路上喫煙・ポイ捨て禁止重点区域",
    fine: "過料2,000円（2023年4月〜）",
    sourceUrl: "https://www.city.toyohashi.lg.jp/5493.htm",
  },
  "愛知県|豊田市": {
    ordinanceName: "豊田市路上喫煙の防止等に関する条例",
    prohibitedAreas: "路上喫煙禁止区域（巡回監視員による指導啓発が中心）",
    fine: "罰則（過料）の規定なし",
    sourceUrl: "https://www.city.toyota.aichi.jp/shisei/gyoseikeikaku/toshiseibi/1026093.html",
  },
  "愛知県|岡崎市": {
    ordinanceName: "岡崎市生活環境の美化の推進に関する条例",
    prohibitedAreas: "市長が指定する路上喫煙禁止区域",
    fine: "過料の規定は確認できず（詳細は公式サイト参照）",
    sourceUrl: "http://webhp.city.okazaki.lg.jp/reiki/reiki_honbun/i504RG00001051.html",
  },
  "愛知県|一宮市": {
    ordinanceName: "一宮市路上等での喫煙等の防止に関する条例",
    prohibitedAreas: "一宮駅周辺の喫煙禁止区域（終日禁止、指定喫煙所を利用）",
    fine: "過料の規定は確認できず（詳細は公式サイト参照）",
    sourceUrl: "https://www.city.ichinomiya.aichi.jp/kankyou/kankyouseisaku/1043982/1043983/1000038/1003115.html",
  },
  "京都府|京都市": {
    ordinanceName: "京都市路上喫煙等の禁止等に関する条例",
    prohibitedAreas: "市内中心部・京都駅地域・清水祇園地域（路上喫煙等対策強化区域）",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.kyoto.lg.jp/bunshi/page/0000291969.html",
  },
  "大阪府|大阪市": {
    ordinanceName: "大阪市路上喫煙の防止に関する条例",
    prohibitedAreas: "市内全域（2025年1月27日〜）",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.osaka.lg.jp/kankyo/page/0000503379.html",
  },
  "大阪府|堺市": {
    ordinanceName: "堺市安全・安心・快適な市民協働のまちづくり条例",
    prohibitedAreas: "堺東駅前・堺駅前・大小路筋・堺市役所周辺の路上喫煙等禁止区域",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.sakai.lg.jp/kurashi/gomi/gomi_recy/torikumi/rojokitsuenkinshi.html",
  },
  "兵庫県|神戸市": {
    ordinanceName: "神戸市ぽい捨て及び路上喫煙の防止に関する条例",
    prohibitedAreas: "三宮・元町地区、六甲道駅周辺地区、須磨海水浴場地区（開設期間中）",
    fine: "過料1,000円（条例上限2,000円）",
    sourceUrl: "https://www.city.kobe.lg.jp/a84526/kurashi/activate/project/eco/area.html",
  },
  "岡山県|岡山市": {
    ordinanceName: "岡山市美しいまちづくり・快適なまちづくり条例",
    prohibitedAreas: "岡山駅周辺の路上喫煙制限区域（指定喫煙場所を除く）",
    fine: "過料1,000円（特別区域）",
    sourceUrl: "https://www.city.okayama.jp/kurashi/0000005170.html",
  },
  "広島県|広島市": {
    ordinanceName: "広島市ぽい捨て等の防止に関する条例",
    prohibitedAreas: "広島駅周辺・紙屋町/八丁堀・広島城周辺・中央公園・平和公園等の喫煙制限区域",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.hiroshima.lg.jp/soshiki/98/13439.html",
  },
  "福岡県|北九州市": {
    ordinanceName: "北九州市公共の場所における喫煙の防止に関する条例",
    prohibitedAreas: "小倉都心地区・黒崎副都心地区（迷惑行為防止重点地区）",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.kitakyushu.lg.jp/contents/924_00480.html",
  },
  "福岡県|福岡市": {
    ordinanceName: "福岡市路上喫煙の防止に関する条例",
    prohibitedAreas: "路上禁煙地区（歩行中・自転車乗車中の喫煙が対象、公園は対象外）",
    fine: "過料2万円以下",
    sourceUrl: "https://www.city.fukuoka.lg.jp/shimin/seikatsuanzen/shisei/rojoukinnenntiku_2.html",
  },
  "熊本県|熊本市": {
    ordinanceName: "熊本市路上喫煙及びポイ捨ての禁止等に関する条例",
    prohibitedAreas: "上通・下通・新市街のアーケード内等の路上禁煙区域",
    fine: "過料1,000円",
    sourceUrl: "https://www.city.kumamoto.jp/kankyo/kiji003852/index.html",
  },
};

for (const ward of NAGOYA_WARDS) {
  STREET_SMOKING_ORDINANCES[`愛知県|名古屋市${ward}`] = NAGOYA_ORDINANCE;
}

export function findOrdinance(prefecture: string, city: string): StreetSmokingOrdinance | null {
  return STREET_SMOKING_ORDINANCES[`${prefecture}|${city}`] ?? null;
}
