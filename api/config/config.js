const os = require('os');

const mongo_path = 'mongodb://superadmin:Ple#set#kec#re!123@localhost:27017/PetNetwork';

const MONGO_PATH = mongo_path

const BASE_PATH = os.homedir() + '/api.mypetnetworks.com/PetNetwork/Upload/'

const JWT_KEY = 'secure_pet_network'

const local = 'http://localhost:3000'

const server = "https://api.mypetnetworks.com";

const SERVER_URL = server;

const ONE_SIGNAL_USER_AUTH_KEY = "ZjhhODAyMGEtOWU5ZC00N2JhLWIyY2MtM2VkZjY5OWJhYzlj"

const ONE_SIGNAL_REST_KEY = "ZjIzNzhjMjYtZWIxYi00YmU0LThjMDAtNjRlZDU2ZjJlMjU5";

const ONE_SIGNAL_APP_ID = "0353aa65-9228-402f-934d-d9a08d5fe61b"

const OWNER_PROPIC_FOLDER = BASE_PATH + "OwnerProPics/"

const FFMPEG_PATH = os.homedir() + "/ffmpeg/ffmpeg"

const FEED_PIC_URL = BASE_PATH + 'FeedPics/';

const ARTICLE_PIC_URL = BASE_PATH + 'ArticlePics/';

const EVENT_URL = BASE_PATH + 'EventPics/';

const PET_PROPIC_FOLDER = BASE_PATH + "PetProPics/"

const PET_VACCINE_FOLDER = BASE_PATH + "PetVaccinePics/"

const PET_HYGIENE_PIC_FOLDER = BASE_PATH + "PetHygienePics/"

const THUMBNAIL_URL = BASE_PATH + 'Thumbnails/';

const CHAT_PIC_URL = BASE_PATH + 'ChatPics/';

module.exports = {
    MONGO_PATH,
    BASE_PATH,
    OWNER_PROPIC_FOLDER,
    JWT_KEY,
    PET_PROPIC_FOLDER,
    PET_VACCINE_FOLDER,
    ONE_SIGNAL_APP_ID,
    ONE_SIGNAL_REST_KEY,
    ONE_SIGNAL_USER_AUTH_KEY,
    FFMPEG_PATH,
    FEED_PIC_URL,
    EVENT_URL,
    ARTICLE_PIC_URL,
    THUMBNAIL_URL,
    SERVER_URL,
    PET_HYGIENE_PIC_FOLDER,
    CHAT_PIC_URL
}
