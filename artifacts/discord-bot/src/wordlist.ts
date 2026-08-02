// ─────────────────────────────────────────────────────────────────────────────
// Filter List — Discord TOS-violating content ONLY.
// Basic swearing (fuck, shit, bitch, ass, damn, etc.) is intentionally allowed.
// This list targets content that can get a server terminated.
// ─────────────────────────────────────────────────────────────────────────────

// ── Racial & Ethnic Slurs ────────────────────────────────────────────────────
const RACIAL_SLURS: string[] = [
  "nigger", "nigg3r", "n1gger",
  "n!gger", "nig nog", "nig-nog",
  "chink", "ch1nk", "ch!nk",
  "gook", "g00k",
  "spic", "sp1c", "sp!c",
  "kike", "k1ke", "k!ke",
  "wetback", "wet back",
  "beaner", "be4ner",
  "towelhead", "towel head",
  "raghead", "rag head",
  "zipperhead",
  "coon", "c00n",
  "jigaboo", "jiggaboo",
  "porch monkey",
  "sand nigger", "sand n",
  "paki", "p4ki", "p@ki",
  "jap", "j@p",
  "ching chong", "ching-chong",
  "negro",
  "mulatto",
  "half breed", "half-breed",
  "redskin", "red skin",
  "squaw",
  "pickaninny",
  "sambo",
  "darkie",
  "jungle bunny",
  "cotton picker",
  "crotch cricket",
  "tar baby", "tar-baby",
  "moon cricket",
  "spearchucker", "spear chucker",
  "Uncle Tom",
  "sellout negro",
  "rice rocket",
  "yellow monkey",
  "camel jockey", "camel-jockey",
  "dothead", "dot head",
  "turban head",
  "curry muncher",
  "hymie",
  "sheeny",
  "greaseball",
  "wop",
  "dago",
  "kraut",
  "zipperhead",
  "mongoloid",
  "gypsy",
  "gypo",
  "pikey",
];

// ── Homophobic & Transphobic Slurs ───────────────────────────────────────────
const LGBTQ_SLURS: string[] = [
  "faggot", "fag", "f4ggot", "f4g", "f@ggot", "f@g",
  "dyke", "d1ke", "d!ke",
  "tranny", "tr4nny", "tr@nny",
  "shemale", "she-male",
  "sodomite",
  "poof", "p00f",
  "batty boy", "battyboy",
  "shirt lifter",
  "pillow biter",
];

// ── Ableist Slurs ────────────────────────────────────────────────────────────
const ABLEIST_SLURS: string[] = [
  "retard", "ret4rd", "r3tard", "retarded", "ret4rded",
  "spaz", "sp4z",
  "mongoloid",
  "cripple",
  "mong",
];

// ── CSAM / Child Exploitation & Sexual Violence ───────────────────────────────
const CSAM: string[] = [
  "child porn", "childporn", "child pornography",
  "loli", "l0li", "l0l1",
  "shota", "sh0ta",
  "jailbait", "jail bait",
  "minor porn", "underage porn", "underage sex",
  "pedo", "p3do", "ped0", "pedo file",
  "pedophile", "pedophilia", "paedophile", "paedophilia",
  "p3dophile", "ped0phile", "p3do", "paedo",
  "hebephile", "hebephilia",
  "ephebophile", "ephebophilia",
  "cheese pizza",
  "cub porn",
  "preteen sex", "preteen nude", "preteen porn",
  "kid porn", "kiddie porn", "kiddy porn",
  "child rape", "child molest", "child molestation", "child molester",
  "toddlercon",
  "babycon",
  "map community", // minor-attracted person euphemism used to groom
  "nomap",
  "minor attracted",
  "child groomer", "grooming children", "grooming minors",
  "send nudes minor", "send nudes kid",
  "rape a child", "rape children", "rape minors",
  "touch kids", "touching kids", "molesting kids",
  // sexual violence general
  "rape", "r4pe", "r@pe",
  "rapist", "r4pist",
  "gang rape", "gang r4pe",
  "i will rape", "ill rape", "gonna rape",
  "sexual assault",
  "i will assault you",
  "non-consensual", "nonconsensual",
  "force myself on",
  "drugged and raped", "roofie",
];

// ── Underage / Minor Solicitation & Grooming ─────────────────────────────────
const UNDERAGE_CONTENT: string[] = [
  // Claims of being underage (self)
  "i'm underage", "im underage", "i am underage",
  "i'm a minor", "im a minor", "i am a minor",
  "minor here", "underage here",
  // Claims about others being underage (he/she/they/you)
  "she is underage", "she's underage", "shes underage",
  "he is underage", "he's underage", "hes underage",
  "they are underage", "they're underage", "theyre underage",
  "you are underage", "you're underage", "ur underage", "u are underage",
  "she is a minor", "she's a minor", "shes a minor",
  "he is a minor", "he's a minor", "hes a minor",
  "they are a minor", "they're a minor", "theyre a minor",
  "you are a minor", "you're a minor", "ur a minor",
  "is underage", "was underage", "are underage", "were underage",
  "is a minor", "was a minor", "are minors", "were minors",
  // Soliciting minors
  "looking for minors", "minors only", "minors welcome", "minors dm",
  "underage welcome", "underage ok", "underage only",
  "do you like minors", "are you a minor",
  "send me a minor", "find me a minor",
  // Grooming language
  "groom a minor", "grooming a minor",
  "i can groom", "how to groom",
  "befriend a minor", "target a minor",
  "gain their trust", "earn their trust",
  "keep it a secret", "don't tell your parents", "dont tell your parents",
  "don't tell anyone", "dont tell anyone",
  "this is our secret", "keep this secret",
  "you're so mature for your age", "youre so mature for your age",
  "mature for your age",
  "not like other kids",
  "send me pics", "send me photos",
  "are you alone", "are u alone",
  "where are your parents", "where r ur parents",
  "meet in person", "meet irl",
  "i'll buy you", "ill buy you", "i will buy you",
  "i can take care of you",
  // Age fishing / verification bypass
  "are you 18", "r u 18", "are u 18",
  "you have to be 18", "must be 18",
  "pretend you're 18", "pretend ur 18", "pretend to be 18",
  "say you're 18", "say ur 18", "say you are 18",
  "act like you're 18", "act like ur 18",
  "act 18",
  // Teen/minor sexualization
  "teen nude", "teen nudes", "teen porn", "teen sex",
  "teen girl nude", "teen boy nude",
  "teenage nude", "teenage porn", "teenage sex",
  "young nude", "young nudes", "young porn",
  "minor nude", "minor nudes",
  "underage nude", "underage nudes",
  "16 year old nude", "15 year old nude", "14 year old nude",
  "13 year old nude", "12 year old nude",
  "16yo nude", "15yo nude", "14yo nude", "13yo nude",
  "high school nude", "high school porn",
  // MAPS / minor-attracted
  "i like minors", "i love minors", "attracted to minors",
  "attracted to kids", "i like kids that way",
  "pro contact", "pro-contact",
  "minor love", "minor-love",
  "age is just a number",
  "consent is a social construct",
  "kids can consent",
  "minors can consent",
  // Minor/adult sexual contact accusations
  "underage sexting", "minor sexting", "kid sexting",
  "sexting a minor", "sexting minors", "sexting a kid", "sexting kids",
  "sexting an adult", "esexing an adult", "e-sexing an adult",
  "esexing adults", "e-sexing adults",
  "talking to an adult", "talking to adults",
  // Exploitation references
  "exploit a minor", "exploiting minors",
  "trafficking minor", "traffic a minor",
  "child trafficking", "minor trafficking",
  "buy a child", "sell a child",
];

// ── Self-Harm & Suicide Encouragement ────────────────────────────────────────
const SELF_HARM: string[] = [
  "kys", "k y s", "k.y.s",
  "kill yourself", "kill urself", "kil yourself",
  "go kill yourself", "just kill yourself",
  "end yourself", "end ur life", "end your life",
  "rope yourself", "rope urself",
  "commit suicide",
  "tie the noose",
  "drink bleach",
  "cut yourself",
  "go die",
];

// ── Violent Threats ───────────────────────────────────────────────────────────
const THREATS: string[] = [
  "i will kill you", "ill kill you", "i'll kill you",
  "im going to kill you", "i'm going to kill you",
  "i will shoot you", "ill shoot you",
  "bomb threat",
  "shoot up the school", "school shooting", "school shooter",
  "mass shooting", "mass shooter",
  "shooting up",
  "i will find you and kill",
  "watch your back",
  "you're dead",
  "your dead",
  "send me your address",
];

// ── Doxxing & Stalking ────────────────────────────────────────────────────────
const DOXXING: string[] = [
  "doxx", "dox", "i will dox", "im gonna dox", "doxxing",
  "swat", "swatting", "i will swat",
  "find your ip", "trace your ip",
  "post your address", "leak your address",
];

// ── Hacking / Malware / IP Logging ───────────────────────────────────────────
const HACKING: string[] = [
  "rat link", "grabify", "ip grabber", "ip logger", "ip grab",
  "ddos", "d-dos", "dox tool",
  "booter", "stresser",
  "botnet",
  "keylogger",
  "trojan horse",
  "ransomware",
  "phishing link",
  "token grabber", "token grab",
  "account stealer",
  "cookie stealer",
  "malware",
  "remote access trojan",
];

// ── Raiding & Server Disruption ───────────────────────────────────────────────
const RAIDING: string[] = [
  "raid this server", "raid them", "lets raid", "let's raid",
  "nuke this server", "server nuke",
  "mass report", "report bot",
  "spam bot",
];

// ── Terrorism & Extremism ─────────────────────────────────────────────────────
const TERRORISM: string[] = [
  "join isis", "join al qaeda", "join al-qaeda",
  "isis recruit", "jihad",
  "white power", "white supremacy", "white supremacist",
  "heil hitler",
  "sieg heil",
  "kkk", "ku klux klan",
  "14 words",
  "blood and soil",
  "white pride",
  "race war",
  "white genocide",
  "great replacement",
  "incel revolution",
  "elliot rodger",
  "christchurch",
  "dylann roof",
  "brenton tarrant",
];

// ── Gore / Snuff / Violent Media Solicitation ─────────────────────────────────
const GORE: string[] = [
  "gore video", "gore site", "gore pic", "gore image", "gore photo",
  "send gore", "post gore", "drop gore", "share gore",
  "snuff film", "snuff video",
  "liveleak",
  "bestgore",
  "necrophilia",
  "body parts for sale",
  "decapitation video", "decapitation pic",
  "beheading video", "beheading pic",
];

// ── Self-Harm Imagery (cut signs, blood walls, etc.) ──────────────────────────
const SELF_HARM_IMAGERY: string[] = [
  "cut sign", "cutsign", "cut signs", "cutsigns",
  "blood wall", "bloodwall", "blood walls", "bloodwalls",
  "cutting pic", "cutting pics", "cutting photo", "cutting image",
  "sh pic", "sh pics", "sh photo", "sh photos",
  "self harm pic", "self harm pics", "self harm photo",
  "self harm image", "self harm images",
  "post cuts", "show cuts", "show me your cuts", "show your cuts",
  "rate my cuts", "rate cuts",
  "fresh cuts", "deep cuts pic",
  "wrist pic", "wrist pics",
  "scar pic", "scar pics",
];

// ── Extortion / Blackmail / Commercial Crime ──────────────────────────────────
const EXTORTION: string[] = [
  "extort", "extortion", "extorting",
  "blackmail", "blackmailing", "i will blackmail",
  "pay me or i leak", "pay or i post", "pay or i expose",
  "ill expose you", "i'll expose you", "gonna expose you",
  "send money or", "venmo me or", "cashapp me or",
  "sextortion", "sex extort",
  "nude extortion", "leak your nudes",
  "i have your nudes", "i have your pics",
  "pay up or", "wire me money",
  "money laundering",
  "fraud scheme",
  "scam people", "scamming people",
  "pyramid scheme",
  "ponzi scheme",
];

// ── Drug Trafficking ──────────────────────────────────────────────────────────
const DRUG_TRAFFICKING: string[] = [
  "buy heroin", "sell heroin",
  "buy meth", "sell meth",
  "buy fentanyl", "sell fentanyl",
  "drug dealer",
  "darkweb drugs", "dark web drugs",
  "buy cocaine",
  "buy crack",
];

// ── Adult / Pornographic Content ─────────────────────────────────────────────
const PORN: string[] = [
  // direct references
  "porn", "porno", "pornography", "p0rn", "pr0n",
  "xxx", "x-rated", "xrated",
  "onlyfans", "only fans", "of link", "my of",
  "pornhub", "xvideos", "xhamster", "redtube", "youporn",
  "xnxx", "spankbang", "eporner", "porntrex",
  // solicitation
  "send nudes", "send nude", "send pics", "send me nudes",
  "nudes for", "nudes trade", "nude trade", "nudes swap",
  "post nudes", "drop nudes", "share nudes",
  "dick pic", "dick pics", "cock pic", "cock pics",
  "pussy pic", "pussy pics", "tit pic", "tit pics",
  "boob pic", "boob pics", "ass pic", "ass pics",
  "nude selfie", "topless pic", "naked pic", "naked pics",
  // sexual service solicitation
  "sex tape", "sextape", "sex vid", "sex video",
  "homemade porn", "amateur porn",
  "cam girl", "camgirl", "cam boy", "camshow", "cam show",
  "findom", "pay pig", "paypig",
  "sugar daddy link", "sugar baby link",
  "fuck buddy", "fuckbuddy", "friends with benefits link",
  "hookup site", "hook up site", "dating site link",
  // explicit sexual acts (keep contextual to avoid false positives)
  "blowjob", "blow job", "hand job", "handjob",
  "cumshot", "cum shot", "facial cum",
  "gangbang", "gang bang",
  "threesome link", "foursome link",
  "orgy", "group sex",
  "hentai", "h3ntai",
  "rule 34",
  "e621",
  "furry nsfw", "nsfw furry",
  "anime porn", "anime hentai",
];

// ── Discord Scams & Phishing ──────────────────────────────────────────────────
const DISCORD_SCAMS: string[] = [
  "free nitro", "nitro gift link", "claim your nitro", "nitro giveaway link",
  "discord nitro free", "get free nitro", "win nitro",
  "steam gift card", "free steam gift",
  "claim your prize", "you have been selected",
  "click this link to claim", "verify your account to claim",
  "your account has been flagged", "your account will be deleted",
  "discord support dm", "official discord dm",
  "account verification required", "verify or get banned",
  "free robux", "robux generator",
  "crypto giveaway", "bitcoin giveaway", "eth giveaway",
  "airdrop claim", "wallet connect scam",
];

// ── Pro-Eating Disorder Content ───────────────────────────────────────────────
const PRO_ED: string[] = [
  "thinspo", "thinspiration",
  "pro-ana", "proana", "pro ana",
  "pro-mia", "promia", "pro mia",
  "meanspo", "reverse thinspo",
  "starving tips", "tips to starve",
  "how to starve", "starvation tips",
  "fasting tips", "extreme fasting",
  "ed tips", "ed tricks",
  "eating disorder tips",
  "binge purge tips", "purging tips",
  "diet pills", "laxative abuse",
  "body check", "body checking",
  "ugw", "sw hw cw gw",
];

// ── Zoophilia / Bestiality ────────────────────────────────────────────────────
const ZOOPHILIA: string[] = [
  "zoophilia", "zoophile",
  "bestiality", "bestial",
  "animal porn", "animal sex",
  "dog porn", "horse porn", "animal rape",
  "zoo porn", "zoop",
  "furry porn real", "irl zoo",
];

// ── Incel / Misogynist Extremism ──────────────────────────────────────────────
const INCEL_EXTREMISM: string[] = [
  "femoid", "foid",
  "roastie", "roasties",
  "chad virgin", "incel uprising",
  "sexual market value", "smv theory",
  "blackpill", "black pill", "blackpilled",
  "lifefuel", "copemaxx", "ropecel",
  "looksmaxxing", "looksmax",
  "heightmaxx",
  "go ER", "elliot rodger hero",
  "women belong", "women are property",
  "rape is justified", "rape is natural",
  "women deserve", "women should be",
  "kill all women", "women hate",
];

// ── Nude Leaks & Leaked Content Sharing ──────────────────────────────────────
const NUDES_LEAKS: string[] = [
  // standalone terms
  "leak", "leaked", "nudes",
  // leaked nudes
  "leaked nudes", "leaked nude", "nude leak", "nude leaks",
  "nudes leaked", "nude dropped", "nudes dropped",
  "leaked pics", "leaked photos", "leaked images", "leaked content",
  "leaked pack", "leak pack", "leak link", "leaks link",
  "nude pack", "nudes pack", "nude bundle", "nudes bundle",
  "nude dump", "nudes dump", "nude collection", "nudes collection",
  // onlyfans / creator leaks
  "onlyfans leak", "onlyfans leaked", "of leak", "of leaked",
  "of content leak", "of pack", "patreon leak", "patreon leaked",
  "fansly leak", "fansly leaked",
  // platform-agnostic leak sharing
  "mega link nudes", "mega nudes", "mega nude", "mega link leak",
  "google drive nudes", "drive link nudes",
  "anonfiles nudes", "gofile nudes",
  "cyberfile nudes", "pixeldrain nudes",
  // nude selfie / snap leaks
  "nude snap", "nude snapchat", "snap leak", "snap leaked",
  "nude dm", "nude dms", "leaked dm", "leaked dms",
  // requests / solicitation
  "drop leaks", "post leaks", "share leaks",
  "drop nudes", "post nudes", "share nudes",
  "anyone got leaks", "got any leaks", "got leaks",
  "anyone got nudes", "got any nudes", "whos got nudes",
  "send leaks", "send me leaks",
  // nsfw explicit solicitation
  "nsfw link", "nsfw links", "nsfw pack", "nsfw dump",
  "nsfw collection", "nsfw content link",
];

// ── Account Trading / TOS Violations ─────────────────────────────────────────
const ACCOUNT_TRADING: string[] = [
  "selling discord account", "buy discord account", "discord account for sale",
  "selling account", "account shop", "acc shop",
  "selling aged account", "og account for sale",
  "selling og username", "og user for sale",
  "account boosting service", "fake boost",
  "selling server members", "buying server members",
  "member farming", "fake members",
];

// ── Hitler & Nazi Content ─────────────────────────────────────────────────────
const HITLER_NAZI: string[] = [
  // Direct names
  "hitler", "adolf hitler", "a. hitler",
  "nazi", "nazis",
  // Third Reich & leadership
  "third reich", "3rd reich", "das reich",
  "fuhrer", "führer", "der fuhrer",
  "heinrich himmler", "himmler",
  "joseph goebbels", "goebbels",
  "hermann goering", "goering", "göring",
  "reinhard heydrich", "heydrich",
  "rudolf hess",
  "martin bormann",
  "eichmann", "adolf eichmann",
  "mengele", "josef mengele",
  // Ideology & texts
  "mein kampf",
  "national socialism", "national socialist",
  "nationalsozialismus",
  "aryan race", "aryan nation", "aryan brotherhood",
  "master race", "herrenvolk",
  "lebensraum",
  "final solution", "endlosung", "endlösung",
  "holocaust denial", "holocaust denier", "holohoax",
  "gas the jews",
  // Symbols & codes
  "swastika", "hakenkreuz",
  "waffen ss", "ss officer",
  "totenkopf",
  // Organizations
  "gestapo",
  "nsdap",
  "sturmabteilung", "brownshirts", "brown shirts",
  "schutzstaffel",
  "hitler youth", "hitlerjugend",
  "neo nazi", "neo-nazi", "neonazi",
];

// ── Nazi Shorthand & Extremist Codes ─────────────────────────────────────────
const NAZI_SHORTHAND: string[] = [
  "heil 88", "88 heil", "h h 88",
  "1312", "acab 1312",
  "rwds",
  "boogaloo", "boog bois",
  "accelerationist", "accelerationism",
  "atomwaffen",
  "proud boys", "oath keepers",
  "three percenters", "3 percenters",
];

// ─── Export ──────────────────────────────────────────────────────────────────

export const BLOCKED_TERMS: string[] = [
  ...RACIAL_SLURS,
  ...LGBTQ_SLURS,
  ...ABLEIST_SLURS,
  ...CSAM,
  ...SELF_HARM,
  ...SELF_HARM_IMAGERY,
  ...THREATS,
  ...DOXXING,
  ...HACKING,
  ...RAIDING,
  ...TERRORISM,
  ...GORE,
  ...DRUG_TRAFFICKING,
  ...EXTORTION,
  ...PORN,
  ...DISCORD_SCAMS,
  ...PRO_ED,
  ...ZOOPHILIA,
  ...INCEL_EXTREMISM,
  ...UNDERAGE_CONTENT,
  ...ACCOUNT_TRADING,
  ...HITLER_NAZI,
  ...NAZI_SHORTHAND,
  ...NUDES_LEAKS,
];

// Regex patterns — catch spacing/symbol tricks ("n i g g e r", "n.i.g.g.e.r", "n,i/g`g'e r")
// SEP matches any separator character someone might insert between letters to evade the filter
const SEP = String.raw`[\s.*_\-@0!1|,/\\;:'"~^` + "`" + `]+`;
const SEP0 = String.raw`[\s.*_\-@0!1|,/\\;:'"~^` + "`" + `]*`;

export const BLOCKED_PATTERNS: { regex: RegExp; label: string }[] = [
  // n-word in any leet/spaced/separated form (requires at least one separator before 'i')
  { regex: new RegExp(String.raw`\bn` + SEP + String.raw`i` + SEP0 + String.raw`g` + SEP0 + String.raw`g` + SEP0 + String.raw`[e3@]`, "i"), label: "racial slur (separator bypass)" },
  // f-slur (faggot) in any separated form (requires separator before 'a')
  { regex: new RegExp(String.raw`\bf` + SEP + String.raw`a` + SEP0 + String.raw`g` + SEP0 + String.raw`g` + SEP0 + String.raw`[o0]` + SEP0 + String.raw`t`, "i"), label: "homophobic slur (separator bypass)" },
  // heil hitler variations
  { regex: new RegExp(String.raw`h` + SEP + String.raw`e` + SEP0 + String.raw`i` + SEP0 + String.raw`l` + SEP + String.raw`h` + SEP0 + String.raw`i` + SEP0 + String.raw`t` + SEP0 + String.raw`l` + SEP0 + String.raw`e` + SEP0 + String.raw`r`, "i"), label: "extremist phrase (separator bypass)" },
  // sieg heil variations
  { regex: new RegExp(String.raw`s` + SEP + String.raw`i` + SEP0 + String.raw`e` + SEP0 + String.raw`g` + SEP + String.raw`h` + SEP0 + String.raw`e` + SEP0 + String.raw`i` + SEP0 + String.raw`l`, "i"), label: "extremist phrase (separator bypass)" },
  // kys in any separated form
  { regex: new RegExp(String.raw`\bk` + SEP + String.raw`y` + SEP0 + String.raw`s\b`, "i"), label: "self-harm encouragement (separator bypass)" },
  // child porn variations
  { regex: new RegExp(String.raw`c` + SEP0 + String.raw`h` + SEP0 + String.raw`i` + SEP0 + String.raw`l` + SEP0 + String.raw`d` + SEP + String.raw`p` + SEP0 + String.raw`o` + SEP0 + String.raw`r` + SEP0 + String.raw`n`, "i"), label: "CSAM (separator bypass)" },
  // loli — requires at least one separator before the 'o' so plain "lol!" is not caught
  { regex: new RegExp(String.raw`\bl` + SEP + String.raw`[o0]` + SEP0 + String.raw`l` + SEP0 + String.raw`[i!1]`, "i"), label: "CSAM term (separator bypass)" },
  // chink variations
  { regex: new RegExp(String.raw`\bc` + SEP0 + String.raw`h` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`n` + SEP0 + String.raw`k\b`, "i"), label: "racial slur (separator bypass)" },
  // retard variations
  { regex: new RegExp(String.raw`\br` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`t` + SEP0 + String.raw`[a4]` + SEP0 + String.raw`r` + SEP0 + String.raw`d\b`, "i"), label: "ableist slur (separator bypass)" },
  // kike variations
  { regex: new RegExp(String.raw`\bk` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`k` + SEP0 + String.raw`[e3]\b`, "i"), label: "racial slur (separator bypass)" },
  // spic variations
  { regex: new RegExp(String.raw`\bs` + SEP0 + String.raw`p` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`c\b`, "i"), label: "racial slur (separator bypass)" },
  // token grabber / stealer
  { regex: new RegExp(String.raw`token` + SEP + String.raw`(grab|steal)`, "i"), label: "token grabber" },
  // ip grab/log
  { regex: new RegExp(String.raw`ip` + SEP + String.raw`(grab|log)`, "i"), label: "IP logger/grabber" },
  // ddos variants
  { regex: new RegExp(String.raw`\bd` + SEP0 + String.raw`d` + SEP0 + String.raw`o` + SEP0 + String.raw`s\b`, "i"), label: "DDoS (separator bypass)" },
  // swatting
  { regex: new RegExp(String.raw`sw` + SEP0 + String.raw`a` + SEP0 + String.raw`t` + SEP0 + String.raw`t` + SEP0 + String.raw`[io]`, "i"), label: "swatting" },
  // rape in any leet/separated form
  { regex: new RegExp(String.raw`\br` + SEP0 + String.raw`[a@4]` + SEP0 + String.raw`p` + SEP0 + String.raw`[e3]\b`, "i"), label: "sexual violence (separator bypass)" },
  // rapist variations
  { regex: new RegExp(String.raw`\br` + SEP0 + String.raw`[a@4]` + SEP0 + String.raw`p` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`s` + SEP0 + String.raw`t\b`, "i"), label: "sexual violence (separator bypass)" },
  // pedo variations
  { regex: new RegExp(String.raw`\bp` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`d` + SEP0 + String.raw`[o0]\b`, "i"), label: "CSAM term (separator bypass)" },
  // pedophile/pedophilia variations
  { regex: new RegExp(String.raw`\bp` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`d` + SEP0 + String.raw`[o0]` + SEP0 + String.raw`(ph|f)`, "i"), label: "CSAM term (separator bypass)" },
  // extort variations
  { regex: new RegExp(String.raw`\bext` + SEP0 + String.raw`o` + SEP0 + String.raw`r` + SEP0 + String.raw`t`, "i"), label: "extortion" },
  // blackmail variations
  { regex: new RegExp(String.raw`\bblack` + SEP0 + String.raw`m` + SEP0 + String.raw`a` + SEP0 + String.raw`i` + SEP0 + String.raw`l\b`, "i"), label: "blackmail" },
  // coon variations
  { regex: new RegExp(String.raw`\bc` + SEP0 + String.raw`[o0]` + SEP0 + String.raw`[o0]` + SEP0 + String.raw`n\b`, "i"), label: "racial slur (separator bypass)" },
  // paki variations
  { regex: new RegExp(String.raw`\bp` + SEP0 + String.raw`[a@4]` + SEP0 + String.raw`k` + SEP0 + String.raw`[i!1]\b`, "i"), label: "racial slur (separator bypass)" },
  // dyke variations
  { regex: new RegExp(String.raw`\bd` + SEP0 + String.raw`[y]` + SEP0 + String.raw`k` + SEP0 + String.raw`[e3]\b`, "i"), label: "homophobic slur (separator bypass)" },
  // free nitro phishing variations
  { regex: new RegExp(String.raw`free` + SEP + String.raw`nitro`, "i"), label: "free nitro phishing" },
  // pro-ana / pro-mia — requires at least one separator so "proed" (not pro-eating-disorder) is not caught
  { regex: new RegExp(String.raw`pro` + SEP + String.raw`(ana|mia|ed)\b`, "i"), label: "pro-eating-disorder content" },
  // porn with leet/separator bypass (p0rn, pr0n, p*rn, etc.)
  { regex: new RegExp(String.raw`\bp` + SEP0 + String.raw`[o0]` + SEP0 + String.raw`r` + SEP0 + String.raw`n\b`, "i"), label: "pornography (separator bypass)" },
  // send nudes / send pics variations
  { regex: new RegExp(String.raw`send` + SEP + String.raw`(nude|nudes|naked|pic|pics)\b`, "i"), label: "solicitation" },
  // onlyfans variations
  { regex: new RegExp(String.raw`only` + SEP + String.raw`fans`, "i"), label: "OnlyFans link" },
  // nude/nudes with leet/separator bypass (n*de, nu.de, etc.)
  { regex: new RegExp(String.raw`\bn` + SEP0 + String.raw`[u]` + SEP0 + String.raw`d` + SEP0 + String.raw`[e3]` + SEP + String.raw`(leak|pack|dump|pic|pics|photo|photos|snap|dm|dms|collection|bundle|drop|selfie)`, "i"), label: "nude content solicitation (separator bypass)" },
  // leaked + nudes/pics/photos/content
  { regex: new RegExp(String.raw`l` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`[a@4]` + SEP0 + String.raw`k` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`d` + SEP + String.raw`(nudes?|pics?|photos?|content|pack|dump|dms?)`, "i"), label: "leaked content (separator bypass)" },
  // send + leaks/nudes bypass
  { regex: new RegExp(String.raw`\bsend` + SEP + String.raw`(leaks?|nudes?)\b`, "i"), label: "leak/nude solicitation" },
  // got + leaks/nudes bypass
  { regex: new RegExp(String.raw`\bgot` + SEP + String.raw`(any` + SEP + String.raw`)?(leaks?|nudes?)\b`, "i"), label: "leak/nude solicitation" },
  // nsfw + link/pack/dump/content
  { regex: new RegExp(String.raw`\bnsfw` + SEP + String.raw`(link|pack|dump|collection|content)`, "i"), label: "NSFW content sharing" },
  // leak + link/pack
  { regex: new RegExp(String.raw`\bleak` + SEP + String.raw`(link|pack|s?)\b`, "i"), label: "leak link/pack" },
  // "im [age under 18]" — catches "im 12", "i'm 14 years old", "i am 15", etc.
  { regex: /\bi'?m\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of being underage" },
  { regex: /\bi\s+am\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of being underage" },
  // third-person age claims — "she is 15", "he's 13 years old", "they are 14", "user is 16"
  { regex: /\b(she|he|they|this\s+(girl|boy|person|user|kid))\s*'?s?\s+(is|are|was|were)\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of another being underage" },
  { regex: /\b(she|he|they|this\s+(girl|boy|person|user|kid))\s+(is|are|was|were)\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of another being underage" },
  // "you are/you're [age under 18]"
  { regex: /\byou'?re?\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of another being underage" },
  { regex: /\byou\s+are\s+(1[0-7]|[5-9])(\s+years?\s+old)?\b/i, label: "claim of another being underage" },
  // "she's/he's/they're underage or a minor"
  { regex: /\b(she|he|they|you)'?r?e?\s+(is\s+)?(underage|a\s+minor)\b/i, label: "claim of another being underage" },
  // "[name/pronoun] is underage / is a minor"
  { regex: /\b\w+\s+(is|are|was|were)\s+(underage|a\s+minor|minors)\b/i, label: "claim of being underage" },
  // "pretend you're [age]" age verification bypass
  { regex: /pretend\s+(you'?re?|ur|u\s+are)\s+(1[0-7]|[5-9])/i, label: "age verification bypass" },
  // minor age + sexual activity + adult — e.g. "she's 13 sexting 22 yr olds", "13 year old esexing adults"
  {
    regex: /\b(1[0-7]|[5-9])\s*(y\/?o|yr\.?s?|year\s*s?\s*old)?\s*(is\s+)?(e[\s-]?sex(ing|ed)?|sext(ing|ed)?|sexting|talking\s+dirty|send(ing)?\s+nudes?|fuck(ing)?|having\s+sex)\s*(with\s+)?(an?\s+)?(adult|grown\s*(up)?|man|woman|guy|girl|[1-9][0-9](\s*(y\/?o|yr\.?s?|year\s*s?\s*old))?)/i,
    label: "minor in sexual contact with adult"
  },
  // adult + sexual activity + minor age — e.g. "22 yr old sexting a 14 year old"
  {
    regex: /\b([1-9][0-9])\s*(y\/?o|yr\.?s?|year\s*s?\s*old)?\s*(is\s+)?(e[\s-]?sex(ing|ed)?|sext(ing|ed)?|sexting|talking\s+dirty|send(ing)?\s+nudes?|fuck(ing)?|having\s+sex)\s*(with\s+)?(a\s+)?(minor|kid|child|1[0-7]|[5-9](\s*(y\/?o|yr\.?s?|year\s*s?\s*old))?)/i,
    label: "adult in sexual contact with minor"
  },
  // pronoun/name + minor age + sexting/adult context — "she's 13 esexing 22 yr olds"
  {
    regex: /\b(she|he|they|this\s+(girl|boy|kid|person|user))\s*'?s?\s*(is\s+)?(1[0-7]|[5-9])\s*(y\/?o|yr\.?s?|year\s*s?\s*old)?\s*(and\s+)?(e[\s-]?sex(ing|ed)?|sext(ing|ed)?|sexting|talking\s+dirty|send(ing)?\s+nudes?|fuck(ing)?|dating|with)\s*(an?\s+)?(adult|grown|[1-9][0-9])/i,
    label: "minor in sexual contact with adult"
  },
  // "teen" + any sexual/nude term
  { regex: /\bteen(age)?\s+(nude|nudes|naked|porn|sex|pic|pics|photo|photos)\b/i, label: "minor sexualization" },
  // "underage" + any sexual term
  { regex: /\bunderage\s+(nude|nudes|naked|porn|sex|pic|pics|photo|photos|girl|boy)\b/i, label: "minor sexualization" },
  // "minor" + sexual/solicitation terms
  { regex: /\bminor\s+(nude|nudes|naked|porn|sex|pic|pics|photo|photos|dm|dms)\b/i, label: "minor solicitation" },
  // grooming: "don't tell" variations
  { regex: /don'?t\s+tell\s+(your\s+)?(parents?|mom|dad|anyone|nobody)\b/i, label: "grooming phrase" },
  // hitler in any separated/leet form
  { regex: new RegExp(String.raw`\bh` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`t` + SEP0 + String.raw`l` + SEP0 + String.raw`[e3]` + SEP0 + String.raw`r\b`, "i"), label: "Hitler (separator bypass)" },
  // nazi in any separated form
  { regex: new RegExp(String.raw`\bn` + SEP0 + String.raw`[a@4]` + SEP0 + String.raw`z` + SEP0 + String.raw`[i!1]\b`, "i"), label: "Nazi (separator bypass)" },
  // swastika separator bypass
  { regex: new RegExp(String.raw`sw` + SEP0 + String.raw`[a@]` + SEP0 + String.raw`s` + SEP0 + String.raw`t` + SEP0 + String.raw`[i!1]` + SEP0 + String.raw`k` + SEP0 + String.raw`[a@]`, "i"), label: "swastika (separator bypass)" },
];
