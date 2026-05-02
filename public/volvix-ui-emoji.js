/**
 * volvix-ui-emoji.js
 * Emoji picker UI for Volvix.
 * Exposes: window.EmojiPicker
 *   EmojiPicker.open(anchorEl, onSelect)
 *   EmojiPicker.close()
 *   EmojiPicker.search(query) -> array
 *
 * Features:
 *  - 1000+ emojis across 9 categories
 *  - Live search by name/keyword
 *  - Recent emojis (localStorage)
 *  - Skin tone modifier for supported emojis
 *  - Keyboard navigation (arrows + Enter + Esc)
 *  - Lightweight, no dependencies
 */
(function (global) {
  'use strict';

  // ---------- Data ----------
  const CATEGORIES = [
    { id: 'recent',   label: 'Recientes',  icon: '🕘' },
    { id: 'smileys',  label: 'Caras',      icon: '😀' },
    { id: 'people',   label: 'Personas',   icon: '👋' },
    { id: 'nature',   label: 'Naturaleza', icon: '🌿' },
    { id: 'food',     label: 'Comida',     icon: '🍔' },
    { id: 'activity', label: 'Actividad',  icon: '⚽' },
    { id: 'travel',   label: 'Viajes',     icon: '✈️' },
    { id: 'objects',  label: 'Objetos',    icon: '💡' },
    { id: 'symbols',  label: 'Símbolos',   icon: '❤️' },
    { id: 'flags',    label: 'Banderas',   icon: '🏳️' }
  ];

  const SKIN_TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
  const SKIN_TONABLE = new Set([
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🫰','🤟','🤘','🤙','🫵','🫱','🫲','🫳','🫴',
    '👈','👉','👆','🖕','👇','☝','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏',
    '✍','💅','🤳','💪','🦵','🦶','👂','🦻','👃','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩',
    '🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵','💂','🥷','👷',
    '🤴','👸','👲','🧕','🤵','👰','🤰','🫃','🫄','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛',
    '🧜','🧝','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴','🧖','🧗','🤺','🏇','⛷','🏂','🏌',
    '🏄','🚣','🏊','⛹','🏋','🚴','🚵','🤸','🤽','🤾','🤹','🧘','🛀','🛌'
  ]);

  // Each emoji: [char, name, keywords...]
  const EMOJIS = {
    smileys: [
      ['😀','grinning','smile','happy'],['😃','smiley','happy','joy'],['😄','smile','laugh'],
      ['😁','beaming','grin'],['😆','grinning squinting','laugh'],['😅','sweat smile'],
      ['🤣','rofl','rolling','laugh'],['😂','joy','tears','laugh'],['🙂','slight smile'],
      ['🙃','upside down'],['🫠','melting'],['😉','wink'],['😊','blush','smile'],
      ['😇','innocent','halo','angel'],['🥰','smiling hearts','love'],['😍','heart eyes','love'],
      ['🤩','star struck'],['😘','kiss','blow'],['😗','kissing'],['☺','relaxed'],
      ['😚','kissing closed'],['😙','kissing smile'],['🥲','smiling tear'],['😋','yum','tasty'],
      ['😛','tongue'],['😜','tongue wink'],['🤪','zany'],['😝','tongue squint'],
      ['🤑','money mouth'],['🤗','hug'],['🤭','hand over mouth'],['🫢','open eyes hand'],
      ['🫣','peeking'],['🤫','shush'],['🤔','thinking'],['🫡','salute'],['🤐','zipper'],
      ['🤨','raised brow'],['😐','neutral'],['😑','expressionless'],['😶','no mouth'],
      ['🫥','dotted line'],['😶‍🌫','face in clouds'],['😏','smirk'],['😒','unamused'],
      ['🙄','eye roll'],['😬','grimace'],['😮‍💨','exhale'],['🤥','lying','pinocchio'],
      ['🫨','shaking'],['😌','relieved'],['😔','pensive'],['😪','sleepy'],['🤤','drooling'],
      ['😴','sleeping','zzz'],['😷','mask','sick'],['🤒','thermometer','sick'],
      ['🤕','head bandage','hurt'],['🤢','nauseated'],['🤮','vomiting'],['🤧','sneezing'],
      ['🥵','hot'],['🥶','cold'],['🥴','woozy','drunk'],['😵','dizzy'],['😵‍💫','spiral eyes'],
      ['🤯','exploding head','mind blown'],['🤠','cowboy'],['🥳','party','celebrate'],
      ['🥸','disguise'],['😎','sunglasses','cool'],['🤓','nerd','glasses'],['🧐','monocle'],
      ['😕','confused'],['🫤','diagonal'],['😟','worried'],['🙁','frown'],['☹','frowning'],
      ['😮','open mouth'],['😯','hushed'],['😲','astonished'],['😳','flushed'],
      ['🥺','pleading'],['🥹','holding tears'],['😦','frowning open'],['😧','anguished'],
      ['😨','fearful'],['😰','anxious sweat'],['😥','sad relieved'],['😢','crying'],
      ['😭','loudly crying','sob'],['😱','screaming'],['😖','confounded'],['😣','persevering'],
      ['😞','disappointed'],['😓','downcast sweat'],['😩','weary'],['😫','tired'],
      ['🥱','yawning'],['😤','huffing'],['😡','pouting','angry'],['😠','angry'],
      ['🤬','cursing'],['😈','smiling devil'],['👿','angry devil'],['💀','skull','dead'],
      ['☠','skull crossbones'],['💩','poop'],['🤡','clown'],['👹','ogre'],['👺','goblin'],
      ['👻','ghost'],['👽','alien'],['👾','space invader'],['🤖','robot']
    ],
    people: [
      ['👋','wave','hello'],['🤚','raised back'],['🖐','hand fingers'],['✋','raised hand','high five'],
      ['🖖','vulcan','spock'],['👌','ok','okay'],['🤌','pinched'],['🤏','pinch'],['✌','victory','peace'],
      ['🤞','crossed fingers','luck'],['🫰','heart fingers'],['🤟','love you'],['🤘','rock','horns'],
      ['🤙','call me'],['👈','left'],['👉','right'],['👆','up'],['🖕','middle finger'],
      ['👇','down'],['☝','index up'],['👍','thumbs up','like'],['👎','thumbs down','dislike'],
      ['✊','fist'],['👊','oncoming fist','punch'],['🤛','left fist'],['🤜','right fist'],
      ['👏','clap','applause'],['🙌','raising hands','praise'],['🫶','heart hands'],
      ['👐','open hands'],['🤲','palms up'],['🤝','handshake','deal'],['🙏','pray','please','thanks'],
      ['✍','writing'],['💅','nail polish'],['🤳','selfie'],['💪','flex','muscle','strong'],
      ['🦾','mechanical arm'],['🦿','mechanical leg'],['🦵','leg'],['🦶','foot'],['👂','ear'],
      ['🦻','hearing aid'],['👃','nose'],['🧠','brain'],['🫀','heart organ'],['🫁','lungs'],
      ['🦷','tooth'],['🦴','bone'],['👀','eyes'],['👁','eye'],['👅','tongue'],['👄','mouth'],
      ['🫦','biting lip'],['👶','baby'],['🧒','child'],['👦','boy'],['👧','girl'],
      ['🧑','person'],['👱','blond'],['👨','man'],['🧔','beard'],['👩','woman'],
      ['🧓','older'],['👴','old man'],['👵','old woman'],['🙍','frowning person'],
      ['🙎','pouting person'],['🙅','no gesture'],['🙆','ok gesture'],['💁','tipping hand'],
      ['🙋','raising hand'],['🧏','deaf'],['🙇','bowing'],['🤦','facepalm'],['🤷','shrug'],
      ['👮','police'],['🕵','detective'],['💂','guard'],['🥷','ninja'],['👷','construction'],
      ['🤴','prince'],['👸','princess'],['👲','cap'],['🧕','headscarf'],['🤵','tuxedo'],
      ['👰','veil','wedding'],['🤰','pregnant'],['🤱','breast feeding'],['👼','baby angel'],
      ['🎅','santa'],['🤶','mrs claus'],['🦸','superhero'],['🦹','supervillain'],
      ['🧙','mage','wizard'],['🧚','fairy'],['🧛','vampire'],['🧜','merperson'],
      ['🧝','elf'],['🧞','genie'],['🧟','zombie'],['💆','massage'],['💇','haircut'],
      ['🚶','walking'],['🧍','standing'],['🧎','kneeling'],['🏃','running'],
      ['💃','dancer'],['🕺','man dancing'],['👯','dancers'],['🧖','sauna'],
      ['🧗','climbing'],['🤺','fencing'],['🏇','horse racing'],['⛷','skier'],
      ['🏂','snowboarder'],['🏌','golfing'],['🏄','surfing'],['🚣','rowing'],
      ['🏊','swimming'],['⛹','bouncing ball'],['🏋','weight lifting'],['🚴','biking'],
      ['🚵','mountain bike'],['🤸','cartwheel'],['🤽','water polo'],['🤾','handball'],
      ['🤹','juggling'],['🧘','yoga','meditation'],['🛀','bath'],['🛌','sleeping bed'],
      ['👭','women holding'],['👫','couple'],['👬','men holding'],['💏','kiss couple'],
      ['💑','couple heart'],['👪','family']
    ],
    nature: [
      ['🐶','dog'],['🐱','cat'],['🐭','mouse'],['🐹','hamster'],['🐰','rabbit'],
      ['🦊','fox'],['🐻','bear'],['🐼','panda'],['🐻‍❄','polar bear'],['🐨','koala'],
      ['🐯','tiger'],['🦁','lion'],['🐮','cow'],['🐷','pig'],['🐽','pig nose'],
      ['🐸','frog'],['🐵','monkey'],['🙈','see no evil'],['🙉','hear no evil'],
      ['🙊','speak no evil'],['🐒','monkey'],['🐔','chicken'],['🐧','penguin'],
      ['🐦','bird'],['🐤','baby chick'],['🐣','hatching'],['🐥','front chick'],
      ['🦆','duck'],['🦅','eagle'],['🦉','owl'],['🦇','bat'],['🐺','wolf'],
      ['🐗','boar'],['🐴','horse'],['🦄','unicorn'],['🐝','bee'],['🪱','worm'],
      ['🐛','bug'],['🦋','butterfly'],['🐌','snail'],['🐞','ladybug'],['🐜','ant'],
      ['🪰','fly'],['🪲','beetle'],['🪳','cockroach'],['🦟','mosquito'],['🦗','cricket'],
      ['🕷','spider'],['🕸','web'],['🦂','scorpion'],['🐢','turtle'],['🐍','snake'],
      ['🦎','lizard'],['🦖','t-rex'],['🦕','sauropod'],['🐙','octopus'],['🦑','squid'],
      ['🦐','shrimp'],['🦞','lobster'],['🦀','crab'],['🐡','blowfish'],['🐠','tropical fish'],
      ['🐟','fish'],['🐬','dolphin'],['🐳','whale'],['🐋','whale 2'],['🦈','shark'],
      ['🐊','crocodile'],['🐅','tiger 2'],['🐆','leopard'],['🦓','zebra'],['🦍','gorilla'],
      ['🦧','orangutan'],['🐘','elephant'],['🦣','mammoth'],['🦛','hippo'],['🦏','rhino'],
      ['🐪','camel'],['🐫','two hump camel'],['🦒','giraffe'],['🦘','kangaroo'],
      ['🦬','bison'],['🐃','water buffalo'],['🐂','ox'],['🐄','cow 2'],['🐎','horse 2'],
      ['🐖','pig 2'],['🐏','ram'],['🐑','sheep'],['🦙','llama'],['🐐','goat'],
      ['🦌','deer'],['🐕','dog 2'],['🐩','poodle'],['🦮','guide dog'],['🐕‍🦺','service dog'],
      ['🐈','cat 2'],['🐈‍⬛','black cat'],['🪶','feather'],['🐓','rooster'],['🦃','turkey'],
      ['🦤','dodo'],['🦚','peacock'],['🦜','parrot'],['🦢','swan'],['🦩','flamingo'],
      ['🕊','dove'],['🐇','rabbit 2'],['🦝','raccoon'],['🦨','skunk'],['🦡','badger'],
      ['🦫','beaver'],['🦦','otter'],['🦥','sloth'],['🐁','mouse 2'],['🐀','rat'],
      ['🐿','squirrel'],['🦔','hedgehog'],['🌵','cactus'],['🎄','christmas tree'],
      ['🌲','evergreen'],['🌳','tree'],['🌴','palm'],['🪵','wood'],['🌱','seedling'],
      ['🌿','herb'],['☘','shamrock'],['🍀','clover','luck'],['🎍','bamboo'],
      ['🪴','potted plant'],['🎋','tanabata'],['🍃','leaves'],['🍂','fallen leaf'],
      ['🍁','maple leaf'],['🍄','mushroom'],['🐚','shell'],['🪨','rock'],
      ['🌾','wheat'],['💐','bouquet'],['🌷','tulip'],['🌹','rose'],['🥀','wilted'],
      ['🌺','hibiscus'],['🌸','cherry blossom'],['🌼','blossom'],['🌻','sunflower'],
      ['🌞','sun face'],['🌝','full moon face'],['🌛','first quarter face'],
      ['🌜','last quarter face'],['🌚','new moon face'],['🌕','full moon'],
      ['🌖','waning gibbous'],['🌗','last quarter'],['🌘','waning crescent'],
      ['🌑','new moon'],['🌒','waxing crescent'],['🌓','first quarter'],
      ['🌔','waxing gibbous'],['🌙','crescent'],['🌎','earth americas'],
      ['🌍','earth africa'],['🌏','earth asia'],['🪐','ringed planet'],
      ['💫','dizzy'],['⭐','star'],['🌟','glowing star'],['✨','sparkles'],
      ['⚡','high voltage','lightning'],['☄','comet'],['💥','collision','boom'],
      ['🔥','fire'],['🌪','tornado'],['🌈','rainbow'],['☀','sun'],['🌤','sun cloud'],
      ['⛅','partly cloudy'],['🌥','cloud sun'],['☁','cloud'],['🌦','sun rain'],
      ['🌧','rain'],['⛈','thunder'],['🌩','lightning cloud'],['🌨','snow cloud'],
      ['❄','snowflake'],['☃','snowman'],['⛄','snowman no snow'],['🌬','wind'],
      ['💨','dash'],['💧','droplet'],['💦','sweat drops'],['🫧','bubbles'],
      ['☔','umbrella rain'],['☂','umbrella'],['🌊','wave','ocean']
    ],
    food: [
      ['🍏','green apple'],['🍎','apple'],['🍐','pear'],['🍊','tangerine'],['🍋','lemon'],
      ['🍌','banana'],['🍉','watermelon'],['🍇','grapes'],['🍓','strawberry'],
      ['🫐','blueberries'],['🍈','melon'],['🍒','cherries'],['🍑','peach'],
      ['🥭','mango'],['🍍','pineapple'],['🥥','coconut'],['🥝','kiwi'],['🍅','tomato'],
      ['🍆','eggplant'],['🥑','avocado'],['🥦','broccoli'],['🥬','leafy green'],
      ['🥒','cucumber'],['🌶','hot pepper'],['🫑','bell pepper'],['🌽','corn'],
      ['🥕','carrot'],['🫒','olive'],['🧄','garlic'],['🧅','onion'],['🥔','potato'],
      ['🍠','sweet potato'],['🥐','croissant'],['🥯','bagel'],['🍞','bread'],
      ['🥖','baguette'],['🫓','flatbread'],['🥨','pretzel'],['🧀','cheese'],
      ['🥚','egg'],['🍳','frying egg'],['🧈','butter'],['🥞','pancakes'],
      ['🧇','waffle'],['🥓','bacon'],['🥩','steak'],['🍗','poultry leg'],
      ['🍖','meat'],['🦴','bone'],['🌭','hot dog'],['🍔','burger'],
      ['🍟','fries'],['🍕','pizza'],['🥪','sandwich'],['🥙','stuffed flatbread'],
      ['🧆','falafel'],['🌮','taco'],['🌯','burrito'],['🫔','tamale'],
      ['🥗','salad'],['🥘','shallow pan'],['🫕','fondue'],['🥫','canned food'],
      ['🍝','spaghetti'],['🍜','ramen'],['🍲','pot of food'],['🍛','curry'],
      ['🍣','sushi'],['🍱','bento'],['🥟','dumpling'],['🦪','oyster'],
      ['🍤','fried shrimp'],['🍙','rice ball'],['🍚','cooked rice'],['🍘','rice cracker'],
      ['🍥','fish cake'],['🥠','fortune cookie'],['🥮','moon cake'],['🍢','oden'],
      ['🍡','dango'],['🍧','shaved ice'],['🍨','ice cream'],['🍦','soft ice cream'],
      ['🥧','pie'],['🧁','cupcake'],['🍰','cake slice'],['🎂','birthday cake'],
      ['🍮','custard'],['🍭','lollipop'],['🍬','candy'],['🍫','chocolate'],
      ['🍿','popcorn'],['🍩','donut'],['🍪','cookie'],['🌰','chestnut'],
      ['🥜','peanuts'],['🍯','honey'],['🥛','milk'],['🍼','baby bottle'],
      ['☕','coffee','hot drink'],['🫖','teapot'],['🍵','tea'],['🧃','juice box'],
      ['🥤','cup straw'],['🧋','bubble tea'],['🍶','sake'],['🍺','beer'],
      ['🍻','beers'],['🥂','clinking glasses'],['🍷','wine'],['🥃','tumbler'],
      ['🍸','cocktail'],['🍹','tropical'],['🧉','mate'],['🍾','champagne'],
      ['🧊','ice'],['🥄','spoon'],['🍴','fork knife'],['🍽','plate'],['🥢','chopsticks'],
      ['🧂','salt']
    ],
    activity: [
      ['⚽','soccer'],['🏀','basketball'],['🏈','american football'],['⚾','baseball'],
      ['🥎','softball'],['🎾','tennis'],['🏐','volleyball'],['🏉','rugby'],
      ['🥏','frisbee'],['🎱','8 ball'],['🪀','yo yo'],['🏓','ping pong'],
      ['🏸','badminton'],['🏒','ice hockey'],['🏑','field hockey'],['🥍','lacrosse'],
      ['🏏','cricket bat'],['🪃','boomerang'],['🥅','goal'],['⛳','flag in hole','golf'],
      ['🪁','kite'],['🏹','bow arrow'],['🎣','fishing'],['🤿','diving mask'],
      ['🥊','boxing'],['🥋','martial arts'],['🎽','running shirt'],['🛹','skateboard'],
      ['🛼','roller skate'],['🛷','sled'],['⛸','ice skate'],['🥌','curling'],
      ['🎿','skis'],['⛷','skier'],['🏂','snowboarder'],['🪂','parachute'],
      ['🏋','weight lifting'],['🤼','wrestling'],['🤸','cartwheel'],['⛹','bouncing ball'],
      ['🤺','fencing'],['🤾','handball'],['🏌','golf'],['🏇','horse race'],
      ['🧘','yoga'],['🏄','surf'],['🏊','swim'],['🤽','water polo'],
      ['🚣','rowing'],['🧗','climb'],['🚵','mountain bike'],['🚴','bike'],
      ['🏆','trophy'],['🥇','gold medal'],['🥈','silver medal'],['🥉','bronze medal'],
      ['🏅','sports medal'],['🎖','military medal'],['🏵','rosette'],['🎗','reminder ribbon'],
      ['🎫','ticket'],['🎟','admission'],['🎪','circus tent'],['🤹','juggling'],
      ['🎭','performing arts'],['🩰','ballet'],['🎨','art palette'],['🎬','clapper'],
      ['🎤','microphone'],['🎧','headphone'],['🎼','musical score'],['🎹','piano'],
      ['🥁','drum'],['🪘','long drum'],['🎷','saxophone'],['🎺','trumpet'],
      ['🎸','guitar'],['🪕','banjo'],['🎻','violin'],['🪗','accordion'],
      ['🎲','dice'],['♟','chess pawn'],['🎯','dart','target'],['🎳','bowling'],
      ['🎮','video game'],['🎰','slot'],['🧩','puzzle']
    ],
    travel: [
      ['🚗','car'],['🚕','taxi'],['🚙','suv'],['🚌','bus'],['🚎','trolley'],
      ['🏎','racing car'],['🚓','police car'],['🚑','ambulance'],['🚒','fire engine'],
      ['🚐','minibus'],['🛻','pickup'],['🚚','delivery truck'],['🚛','semi truck'],
      ['🚜','tractor'],['🦯','white cane'],['🦽','manual wheelchair'],['🦼','motor wheelchair'],
      ['🛴','scooter'],['🚲','bike'],['🛵','motor scooter'],['🏍','motorcycle'],
      ['🛺','auto rickshaw'],['🚨','police light'],['🚔','police car oncoming'],
      ['🚍','bus oncoming'],['🚘','car oncoming'],['🚖','taxi oncoming'],
      ['🚡','aerial tramway'],['🚠','mountain cableway'],['🚟','suspension'],
      ['🚃','railway car'],['🚋','tram car'],['🚞','mountain railway'],
      ['🚝','monorail'],['🚄','high speed train'],['🚅','bullet train'],
      ['🚈','light rail'],['🚂','locomotive'],['🚆','train'],['🚇','metro'],
      ['🚊','tram'],['🚉','station'],['✈','plane'],['🛫','takeoff'],
      ['🛬','landing'],['🛩','small plane'],['💺','seat'],['🛰','satellite'],
      ['🚀','rocket'],['🛸','ufo'],['🚁','helicopter'],['🛶','canoe'],
      ['⛵','sailboat'],['🚤','speedboat'],['🛥','motor boat'],['🛳','passenger ship'],
      ['⛴','ferry'],['🚢','ship'],['⚓','anchor'],['🪝','hook'],['⛽','fuel'],
      ['🚧','construction'],['🚦','traffic light'],['🚥','horizontal traffic light'],
      ['🗺','world map'],['🗿','moai'],['🗽','statue of liberty'],['🗼','tokyo tower'],
      ['🏰','castle'],['🏯','japanese castle'],['🏟','stadium'],['🎡','ferris wheel'],
      ['🎢','roller coaster'],['🎠','carousel'],['⛲','fountain'],['⛱','beach umbrella'],
      ['🏖','beach'],['🏝','desert island'],['🏜','desert'],['🌋','volcano'],
      ['⛰','mountain'],['🏔','snow mountain'],['🗻','mt fuji'],['🏕','camping'],
      ['⛺','tent'],['🛖','hut'],['🏠','house'],['🏡','house garden'],
      ['🏘','houses'],['🏚','derelict'],['🏗','construction'],['🏭','factory'],
      ['🏢','office'],['🏬','department store'],['🏣','japan post'],['🏤','post'],
      ['🏥','hospital'],['🏦','bank'],['🏨','hotel'],['🏪','convenience store'],
      ['🏫','school'],['🏩','love hotel'],['💒','wedding'],['🏛','classical'],
      ['⛪','church'],['🕌','mosque'],['🛕','hindu temple'],['🕍','synagogue'],
      ['⛩','shinto shrine'],['🕋','kaaba'],['⛲','fountain'],['⛺','tent'],
      ['🌁','foggy'],['🌃','night stars'],['🏙','cityscape'],['🌄','sunrise mountain'],
      ['🌅','sunrise'],['🌆','dusk'],['🌇','sunset'],['🌉','bridge night'],
      ['♨','hot springs'],['🎠','carousel'],['🎢','coaster'],['💈','barber'],
      ['🎪','tent']
    ],
    objects: [
      ['⌚','watch'],['📱','phone'],['📲','phone arrow'],['💻','laptop'],
      ['⌨','keyboard'],['🖥','desktop'],['🖨','printer'],['🖱','mouse'],
      ['🖲','trackball'],['🕹','joystick'],['🗜','clamp'],['💽','minidisc'],
      ['💾','floppy','save'],['💿','cd'],['📀','dvd'],['📼','vhs'],
      ['📷','camera'],['📸','flash camera'],['📹','video camera'],['🎥','movie camera'],
      ['📽','film projector'],['🎞','film frames'],['📞','phone receiver'],['☎','telephone'],
      ['📟','pager'],['📠','fax'],['📺','tv'],['📻','radio'],['🎙','studio mic'],
      ['🎚','level slider'],['🎛','knobs'],['🧭','compass'],['⏱','stopwatch'],
      ['⏲','timer'],['⏰','alarm'],['🕰','mantelpiece clock'],['⌛','hourglass done'],
      ['⏳','hourglass flowing'],['📡','satellite antenna'],['🔋','battery'],
      ['🪫','low battery'],['🔌','plug'],['💡','bulb','idea'],['🔦','flashlight'],
      ['🕯','candle'],['🪔','diya'],['🧯','extinguisher'],['🛢','oil drum'],
      ['💸','money wings'],['💵','dollar'],['💴','yen'],['💶','euro'],
      ['💷','pound'],['🪙','coin'],['💰','money bag'],['💳','credit card'],
      ['💎','gem'],['⚖','balance'],['🪜','ladder'],['🧰','toolbox'],
      ['🪛','screwdriver'],['🔧','wrench'],['🔨','hammer'],['⚒','hammer pick'],
      ['🛠','tools'],['⛏','pick'],['🪚','saw'],['🔩','nut bolt'],
      ['⚙','gear'],['🪤','mouse trap'],['🧱','brick'],['⛓','chains'],
      ['🧲','magnet'],['🔫','water pistol'],['💣','bomb'],['🧨','firecracker'],
      ['🪓','axe'],['🔪','knife'],['🗡','dagger'],['⚔','crossed swords'],
      ['🛡','shield'],['🚬','cigarette'],['⚰','coffin'],['🪦','headstone'],
      ['⚱','urn'],['🏺','amphora'],['🔮','crystal ball'],['📿','prayer beads'],
      ['🧿','nazar'],['🪬','hamsa'],['💈','barber pole'],['⚗','alembic'],
      ['🔭','telescope'],['🔬','microscope'],['🕳','hole'],['🩹','bandage'],
      ['🩺','stethoscope'],['💊','pill'],['💉','syringe'],['🩸','blood drop'],
      ['🧬','dna'],['🦠','microbe'],['🧫','petri'],['🧪','test tube'],
      ['🌡','thermometer'],['🧹','broom'],['🧺','basket'],['🧻','toilet paper'],
      ['🚽','toilet'],['🚰','potable water'],['🚿','shower'],['🛁','bathtub'],
      ['🛀','bath person'],['🧼','soap'],['🪥','toothbrush'],['🪒','razor'],
      ['🧽','sponge'],['🪣','bucket'],['🧴','lotion'],['🛎','bellhop bell'],
      ['🔑','key'],['🗝','old key'],['🚪','door'],['🪑','chair'],
      ['🛋','couch'],['🛏','bed'],['🛌','sleep bed'],['🧸','teddy bear'],
      ['🪆','nesting dolls'],['🖼','framed picture'],['🪞','mirror'],['🪟','window'],
      ['🛍','shopping bag'],['🛒','cart'],['🎁','gift','present'],['🎈','balloon'],
      ['🎏','carp streamer'],['🎀','ribbon'],['🎊','confetti'],['🎉','party popper'],
      ['🎎','japanese dolls'],['🏮','red lantern'],['🎐','wind chime'],['🧧','red envelope'],
      ['✉','envelope'],['📩','envelope arrow'],['📨','incoming envelope'],['📧','email'],
      ['💌','love letter'],['📥','inbox'],['📤','outbox'],['📦','package'],
      ['🏷','label'],['🪧','placard'],['📪','closed mailbox flag down'],
      ['📫','closed mailbox flag up'],['📬','open mailbox flag up'],
      ['📭','open mailbox flag down'],['📮','postbox'],['📯','postal horn'],
      ['📜','scroll'],['📃','page curl'],['📄','page'],['📑','bookmark tabs'],
      ['🧾','receipt'],['📊','bar chart'],['📈','chart up'],['📉','chart down'],
      ['🗒','spiral notepad'],['🗓','spiral calendar'],['📆','tear off calendar'],
      ['📅','calendar'],['🗑','wastebasket'],['📇','card index'],['🗃','card file box'],
      ['🗳','ballot box'],['🗄','file cabinet'],['📋','clipboard'],['📁','folder'],
      ['📂','open folder'],['🗂','dividers'],['🗞','rolled newspaper'],['📰','newspaper'],
      ['📓','notebook'],['📔','notebook decorative'],['📒','ledger'],['📕','closed book'],
      ['📗','green book'],['📘','blue book'],['📙','orange book'],['📚','books'],
      ['📖','open book'],['🔖','bookmark'],['🧷','safety pin'],['🔗','link'],
      ['📎','paperclip'],['🖇','paperclips'],['📐','triangular ruler'],['📏','ruler'],
      ['🧮','abacus'],['📌','pushpin'],['📍','round pushpin'],['✂','scissors'],
      ['🖊','pen'],['🖋','fountain pen'],['✒','black nib'],['🖌','paintbrush'],
      ['🖍','crayon'],['📝','memo'],['✏','pencil'],['🔍','magnifier'],
      ['🔎','magnifier right'],['🔏','locked pen'],['🔐','locked key'],
      ['🔒','locked'],['🔓','unlocked']
    ],
    symbols: [
      ['❤','red heart','love'],['🧡','orange heart'],['💛','yellow heart'],
      ['💚','green heart'],['💙','blue heart'],['💜','purple heart'],
      ['🖤','black heart'],['🤍','white heart'],['🤎','brown heart'],
      ['💔','broken heart'],['❣','heart exclamation'],['💕','two hearts'],
      ['💞','revolving hearts'],['💓','beating heart'],['💗','growing heart'],
      ['💖','sparkling heart'],['💘','heart arrow'],['💝','heart ribbon'],
      ['💟','heart decoration'],['☮','peace'],['✝','latin cross'],['☪','star crescent'],
      ['🕉','om'],['☸','dharma'],['✡','star david'],['🔯','six pointed'],
      ['🕎','menorah'],['☯','yin yang'],['☦','orthodox cross'],['🛐','place of worship'],
      ['⛎','ophiuchus'],['♈','aries'],['♉','taurus'],['♊','gemini'],['♋','cancer'],
      ['♌','leo'],['♍','virgo'],['♎','libra'],['♏','scorpio'],['♐','sagittarius'],
      ['♑','capricorn'],['♒','aquarius'],['♓','pisces'],['🆔','id'],
      ['⚛','atom'],['🉑','accept'],['☢','radioactive'],['☣','biohazard'],
      ['📴','phone off'],['📳','vibration'],['🈶','not free'],['🈚','free'],
      ['🈸','application'],['🈺','open for business'],['🈷','monthly amount'],
      ['✴','eight pointed'],['🆚','vs'],['💮','white flower'],['🉐','bargain'],
      ['㊙','secret'],['㊗','congratulations'],['🈴','passing'],['🈵','no vacancy'],
      ['🈹','discount'],['🈲','prohibited'],['🅰','a button'],['🅱','b button'],
      ['🆎','ab button'],['🆑','cl button'],['🅾','o button'],['🆘','sos'],
      ['❌','x','no'],['⭕','o','yes'],['🛑','stop'],['⛔','no entry'],
      ['📛','name badge'],['🚫','prohibited'],['💯','100'],['💢','anger'],
      ['♨','hot springs'],['🚷','no pedestrians'],['🚯','no littering'],
      ['🚳','no bicycles'],['🚱','non potable'],['🔞','no one under 18'],
      ['📵','no mobile'],['🚭','no smoking'],['❗','exclamation'],['❕','white exclamation'],
      ['❓','question'],['❔','white question'],['‼','double exclamation'],
      ['⁉','exclamation question'],['🔅','dim'],['🔆','bright'],['〽','part alternation'],
      ['⚠','warning'],['🚸','children crossing'],['🔱','trident'],['⚜','fleur de lis'],
      ['🔰','japanese beginner'],['♻','recycle'],['✅','check mark'],['🈯','reserved'],
      ['💹','chart yen'],['❇','sparkle'],['✳','eight spoked'],['❎','cross mark button'],
      ['🌐','globe meridians'],['💠','diamond dot'],['Ⓜ','m'],['🌀','cyclone'],
      ['💤','zzz','sleep'],['🏧','atm'],['🚾','wc'],['♿','wheelchair'],
      ['🅿','parking'],['🛗','elevator'],['🈳','vacancy'],['🈂','sa'],
      ['🛂','passport control'],['🛃','customs'],['🛄','baggage'],['🛅','left luggage'],
      ['🚹','men'],['🚺','women'],['🚼','baby symbol'],['🚻','restroom'],
      ['🚮','litter'],['🎦','cinema'],['📶','signal bars'],['🈁','here'],
      ['🔣','symbols'],['ℹ','info'],['🔤','abc'],['🔡','abcd lower'],
      ['🔠','ABCD'],['🆖','ng'],['🆗','ok'],['🆙','up'],['🆒','cool'],
      ['🆕','new'],['🆓','free'],['0️⃣','0'],['1️⃣','1'],['2️⃣','2'],
      ['3️⃣','3'],['4️⃣','4'],['5️⃣','5'],['6️⃣','6'],['7️⃣','7'],
      ['8️⃣','8'],['9️⃣','9'],['🔟','10'],['🔢','1234'],['#️⃣','hash'],
      ['*️⃣','asterisk'],['⏏','eject'],['▶','play'],['⏸','pause'],
      ['⏯','play pause'],['⏹','stop'],['⏺','record'],['⏭','next track'],
      ['⏮','previous track'],['⏩','fast forward'],['⏪','rewind'],['⏫','double up'],
      ['⏬','double down'],['◀','reverse'],['🔼','up small'],['🔽','down small'],
      ['➡','right arrow'],['⬅','left arrow'],['⬆','up arrow'],['⬇','down arrow'],
      ['↗','up right'],['↘','down right'],['↙','down left'],['↖','up left'],
      ['↕','up down'],['↔','left right'],['↪','arrow right curving left'],
      ['↩','arrow left curving right'],['⤴','curving up'],['⤵','curving down'],
      ['🔀','shuffle'],['🔁','repeat'],['🔂','repeat one'],['🔄','arrows counterclockwise'],
      ['🔃','arrows clockwise'],['🎵','music note'],['🎶','musical notes'],
      ['➕','plus'],['➖','minus'],['➗','divide'],['✖','multiply'],
      ['🟰','heavy equals'],['♾','infinity'],['💲','dollar sign'],['💱','currency exchange'],
      ['™','trade mark'],['©','copyright'],['®','registered'],['👁‍🗨','eye in bubble'],
      ['🔚','end'],['🔙','back'],['🔛','on'],['🔝','top'],['🔜','soon'],
      ['〰','wavy dash'],['➰','curly loop'],['➿','double curly loop'],
      ['✔','check'],['☑','ballot check'],['🔘','radio'],['🔴','red circle'],
      ['🟠','orange circle'],['🟡','yellow circle'],['🟢','green circle'],
      ['🔵','blue circle'],['🟣','purple circle'],['⚫','black circle'],
      ['⚪','white circle'],['🟤','brown circle'],['🔺','red triangle up'],
      ['🔻','red triangle down'],['🔸','small orange diamond'],['🔹','small blue diamond'],
      ['🔶','large orange diamond'],['🔷','large blue diamond'],['🔳','white square button'],
      ['🔲','black square button'],['▪','black small square'],['▫','white small square'],
      ['◾','black medium small'],['◽','white medium small'],['◼','black medium'],
      ['◻','white medium'],['🟥','red square'],['🟧','orange square'],
      ['🟨','yellow square'],['🟩','green square'],['🟦','blue square'],
      ['🟪','purple square'],['⬛','black large square'],['⬜','white large square'],
      ['🟫','brown square']
    ],
    flags: [
      ['🏁','checkered'],['🚩','triangular'],['🎌','crossed flags'],['🏴','black flag'],
      ['🏳','white flag'],['🏳‍🌈','rainbow','pride'],['🏳‍⚧','transgender'],
      ['🏴‍☠','pirate'],['🇦🇷','argentina'],['🇧🇷','brazil'],['🇨🇱','chile'],
      ['🇨🇴','colombia'],['🇲🇽','mexico'],['🇵🇪','peru'],['🇺🇾','uruguay'],
      ['🇻🇪','venezuela'],['🇪🇸','spain'],['🇺🇸','usa'],['🇨🇦','canada'],
      ['🇬🇧','uk','britain'],['🇫🇷','france'],['🇩🇪','germany'],['🇮🇹','italy'],
      ['🇵🇹','portugal'],['🇨🇭','switzerland'],['🇧🇪','belgium'],['🇳🇱','netherlands'],
      ['🇸🇪','sweden'],['🇳🇴','norway'],['🇩🇰','denmark'],['🇫🇮','finland'],
      ['🇵🇱','poland'],['🇷🇺','russia'],['🇺🇦','ukraine'],['🇨🇳','china'],
      ['🇯🇵','japan'],['🇰🇷','korea'],['🇮🇳','india'],['🇹🇭','thailand'],
      ['🇻🇳','vietnam'],['🇮🇩','indonesia'],['🇵🇭','philippines'],['🇲🇾','malaysia'],
      ['🇸🇬','singapore'],['🇦🇺','australia'],['🇳🇿','new zealand'],['🇿🇦','south africa'],
      ['🇪🇬','egypt'],['🇲🇦','morocco'],['🇳🇬','nigeria'],['🇰🇪','kenya'],
      ['🇹🇷','turkey'],['🇸🇦','saudi arabia'],['🇦🇪','uae'],['🇮🇱','israel'],
      ['🇮🇷','iran'],['🇮🇶','iraq'],['🇵🇰','pakistan'],['🇧🇩','bangladesh'],
      ['🇨🇺','cuba'],['🇩🇴','dominican republic'],['🇬🇹','guatemala'],['🇭🇳','honduras'],
      ['🇸🇻','el salvador'],['🇳🇮','nicaragua'],['🇨🇷','costa rica'],['🇵🇦','panama'],
      ['🇵🇷','puerto rico'],['🇧🇴','bolivia'],['🇪🇨','ecuador'],['🇵🇾','paraguay'],
      ['🇮🇪','ireland'],['🇬🇷','greece'],['🇦🇹','austria'],['🇨🇿','czech'],
      ['🇭🇺','hungary'],['🇷🇴','romania'],['🇸🇰','slovakia'],['🇧🇬','bulgaria'],
      ['🇭🇷','croatia'],['🇷🇸','serbia'],['🇮🇸','iceland'],['🇪🇪','estonia'],
      ['🇱🇹','lithuania'],['🇱🇻','latvia'],['🇲🇹','malta'],['🇨🇾','cyprus'],
      ['🇱🇺','luxembourg']
    ]
  };

  // ---------- State ----------
  const STORAGE_KEY = 'volvix_emoji_recent_v1';
  const TONE_KEY    = 'volvix_emoji_tone_v1';
  const MAX_RECENT  = 32;

  let _root = null;
  let _onSelect = null;
  let _activeCat = 'smileys';
  let _query = '';
  let _tone = loadTone();

  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function saveRecent(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); }
    catch {}
  }
  function pushRecent(emoji) {
    const list = loadRecent().filter(e => e !== emoji);
    list.unshift(emoji);
    saveRecent(list);
  }
  function loadTone() {
    try { return parseInt(localStorage.getItem(TONE_KEY) || '0', 10) || 0; }
    catch { return 0; }
  }
  function saveTone(t) {
    try { localStorage.setItem(TONE_KEY, String(t)); } catch {}
  }

  function applyTone(emoji) {
    if (!_tone) return emoji;
    const base = Array.from(emoji)[0];
    if (SKIN_TONABLE.has(base)) return base + SKIN_TONES[_tone];
    return emoji;
  }

  // ---------- Search ----------
  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const cat of Object.keys(EMOJIS)) {
      for (const row of EMOJIS[cat]) {
        const [ch, ...kws] = row;
        if (kws.some(k => k.toLowerCase().includes(q))) out.push(ch);
        if (out.length >= 200) return out;
      }
    }
    return out;
  }

  // ---------- Styles ----------
  const CSS = `
    .vex-pop{position:fixed;z-index:99999;width:340px;height:400px;background:#1e1e2e;
      border:1px solid #45475a;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);
      display:flex;flex-direction:column;color:#cdd6f4;font:13px system-ui,sans-serif}
    .vex-pop *{box-sizing:border-box}
    .vex-search{padding:8px;border-bottom:1px solid #45475a}
    .vex-search input{width:100%;padding:6px 10px;border-radius:6px;border:1px solid #585b70;
      background:#181825;color:#cdd6f4;outline:none}
    .vex-cats{display:flex;border-bottom:1px solid #45475a;overflow-x:auto}
    .vex-cat{flex:0 0 auto;padding:6px 8px;cursor:pointer;font-size:18px;border:none;background:transparent}
    .vex-cat.active{background:#313244;border-bottom:2px solid #89b4fa}
    .vex-grid{flex:1;overflow-y:auto;padding:6px;display:grid;
      grid-template-columns:repeat(8,1fr);gap:2px;align-content:start}
    .vex-em{font-size:20px;cursor:pointer;text-align:center;padding:4px;border-radius:4px;
      border:none;background:transparent;color:inherit}
    .vex-em:hover,.vex-em.kbd{background:#45475a}
    .vex-foot{display:flex;align-items:center;gap:4px;padding:4px 8px;border-top:1px solid #45475a;
      background:#181825;font-size:11px}
    .vex-tone{cursor:pointer;border:1px solid transparent;border-radius:50%;width:18px;height:18px;
      display:inline-flex;align-items:center;justify-content:center;font-size:14px}
    .vex-tone.sel{border-color:#89b4fa}
    .vex-empty{grid-column:1/-1;text-align:center;padding:20px;color:#6c7086}
  `;

  function injectStyles() {
    if (document.getElementById('vex-styles')) return;
    const s = document.createElement('style');
    s.id = 'vex-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Rendering ----------
  function render() {
    if (!_root) return;
    const grid = _root.querySelector('.vex-grid');
    let list;
    if (_query) {
      list = search(_query);
    } else if (_activeCat === 'recent') {
      list = loadRecent();
    } else {
      list = (EMOJIS[_activeCat] || []).map(r => r[0]);
    }
    if (!list.length) {
      grid.innerHTML = `<div class="vex-empty">Sin resultados</div>`;
      return;
    }
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'vex-em';
      btn.textContent = applyTone(em);
      btn.title = em;
      btn.addEventListener('click', () => pickEmoji(applyTone(em)));
      frag.appendChild(btn);
    });
    grid.appendChild(frag);

    _root.querySelectorAll('.vex-cat').forEach(c => {
      c.classList.toggle('active', c.dataset.cat === _activeCat && !_query);
    });
  }

  function pickEmoji(em) {
    pushRecent(em);
    if (typeof _onSelect === 'function') {
      try { _onSelect(em); } catch (e) { console.error(e); }
    }
    close();
  }

  function build() {
    injectStyles();
    const root = document.createElement('div');
    root.className = 'vex-pop';
    root.innerHTML = `
      <div class="vex-search"><input type="text" placeholder="Buscar emoji..."></div>
      <div class="vex-cats">
        ${CATEGORIES.map(c =>
          `<button class="vex-cat" data-cat="${c.id}" title="${c.label}">${c.icon}</button>`
        ).join('')}
      </div>
      <div class="vex-grid"></div>
      <div class="vex-foot">
        <span>Tono:</span>
        ${SKIN_TONES.map((t,i)=>
          `<button class="vex-tone${i===_tone?' sel':''}" data-tone="${i}">${i===0?'✋':'✋'+t}</button>`
        ).join('')}
      </div>
    `;
    const input = root.querySelector('input');
    input.addEventListener('input', () => { _query = input.value; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') {
        const first = root.querySelector('.vex-em');
        if (first) first.click();
      }
    });
    root.querySelectorAll('.vex-cat').forEach(b => {
      b.addEventListener('click', () => {
        _activeCat = b.dataset.cat;
        _query = '';
        input.value = '';
        render();
      });
    });
    root.querySelectorAll('.vex-tone').forEach(b => {
      b.addEventListener('click', () => {
        _tone = parseInt(b.dataset.tone, 10);
        saveTone(_tone);
        root.querySelectorAll('.vex-tone').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        render();
      });
    });
    return root;
  }

  function position(anchor) {
    if (!_root) return;
    const r = anchor && anchor.getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: 100, bottom: 100, top: 100 };
    const w = 340, h = 400;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + w > innerWidth)  left = innerWidth - w - 8;
    if (top + h > innerHeight)  top = r.top - h - 6;
    if (top < 8) top = 8;
    _root.style.left = Math.max(8, left) + 'px';
    _root.style.top  = top + 'px';
  }

  function onDocClick(e) {
    if (_root && !_root.contains(e.target)) close();
  }

  function open(anchor, onSelect) {
    close();
    _onSelect = onSelect;
    _activeCat = loadRecent().length ? 'recent' : 'smileys';
    _query = '';
    _root = build();
    document.body.appendChild(_root);
    position(anchor);
    render();
    setTimeout(() => {
      _root.querySelector('input').focus();
      document.addEventListener('mousedown', onDocClick);
    }, 0);
  }

  function close() {
    document.removeEventListener('mousedown', onDocClick);
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    _root = null;
    _onSelect = null;
  }

  global.EmojiPicker = { open, close, search, CATEGORIES, EMOJIS };

})(window);
