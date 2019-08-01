const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const OneSignal = require('onesignal-node');
const schedule = require('node-schedule');
const path = require('path');

//import model
const Reminder = require('./api/models/reminder')
const Notification = require('./api/models/notification')
const Owner = require('./api/models/owner')

//import route
const ownerRouter = require('./api/routes/owners');
const vetRouter = require('./api/routes/vet');
const commentRouter = require('./api/routes/comments')
const petRouter = require('./api/routes/pet');
const postRouter = require('./api/routes/posts');
const articleRouter = require('./api/routes/articles');
const eventRouter = require('./api/routes/events');
const notiRouter = require('./api/routes/notification');
const chatRouter = require('./api/routes/chats');

const webRouter = require('./api/routes/web');

const config = require('./api/config/config');
const { getAllSubscriber } = require('./api/utils/get-all-subscriber')

let app = express();
let server = require('http').Server(app)
let io = require('socket.io')(server)

const all_posts_socket = io.of('/all_posts').on('connection', () => { });

const likes_socket = io.of('/all_likes').on('connection', () => { });

const follower_posts_socket = io.of('/follower_posts').on('connection', () => { });

const noties_socket = io.of('/all_noties').on('connection', () => { });

const chat_socket = io.of('/all_chats').on('connection', () => { });

//creating a new client for one single app
const myClient = new OneSignal.Client({
    userAuthKey: config.ONE_SIGNAL_USER_AUTH_KEY,
    app: { appAuthKey: config.ONE_SIGNAL_REST_KEY, appId: config.ONE_SIGNAL_APP_ID }
});

//db config
mongoose.Promise = global.Promise;
mongoose.connect(config.MONGO_PATH, { useNewUrlParser: true, autoIndex: false, useCreateIndex: true, }, (err) => {
    if (err) {
        console.log("Can't connect to db.");
    }
    console.log('Connected to db.')
});

const cron = '0 0 10 ? * MON,TUE,WED,THU,FRI,SAT,SUN *';

const every_min = '0 58 15 ? * MON,TUE,WED,THU,FRI,SAT,SUN *';

//run scheduler
let j = schedule.scheduleJob(cron, async () => {
    console.log("Start reminder");
    let background_playerIds = [];

    try {

        let reminder = await Reminder.find().populate("pet").exec();

        const currentDate = new Date();

        const currentDay = currentDate.getDate();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        if (reminder.length > 0) {

            for (i = 0; i < reminder.length; i++) {

                const savedDate = reminder[i].date.split('/');

                const savedDay = parseInt(savedDate[0]);
                const savedMonth = parseInt(savedDate[1]);
                const savedYear = parseInt(savedDate[2]);

                const newNoti = new Notification(
                    {
                        _id: new mongoose.Types.ObjectId(),
                        type: reminder[i].type,
                        pet: reminder[i].pet._id,
                        dataId: reminder[i].pet._id,
                        media: reminder[i].pet.petProPic
                    }
                )

                const hygiene_type = reminder[i].type.toLowerCase().replace('-', '').replace('pet', '');

                //codition to push noti
                if ((savedYear == currentYear) && (savedMonth == currentMonth)) {
                    //for today reminder
                    if (savedDay == currentDay) {
                        //save the noti
                        const rnNewNoti = await newNoti.save();

                        let rnNoti = await Notification.findById(rnNewNoti._id)
                            .populate({
                                path: 'pet',
                                select: 'petName petProPic reminder',
                                populate: {
                                    path: "reminder",
                                    select: "date type"
                                },
                            })
                            .populate('media', 'contentType')
                            .exec()

                        const petOwnerId = reminder[i].pet.owner

                        const noti_subcriber = getAllSubscriber(noties_socket)

                        for (let i = 0, len = noti_subcriber.length; i < len; i++) {

                            const { each_socket, owner_id } = noti_subcriber[i];

                            if (owner_id == petOwnerId) {
                                rnNoti && each_socket.emit('noti::created', rnNoti);
                            }
                        }

                        let petOwner = await Owner.findById(petOwnerId).exec()

                        if (petOwner) {
                            const playerIds = petOwner.playerIds;

                            for (let j of playerIds) {
                                const { playerId, status } = j;
                                if ((status === 'background') || (status === 'inactive')) {
                                    background_playerIds.push(playerId);
                                }
                            }
                        }

                        petOwner.notiLists.push(rnNoti._id);

                        await petOwner.save();

                        if (background_playerIds.length >= 1) {

                            if (rnNoti) {
                                const description = reminder[i].pet.petName + ` has ${hygiene_type} schedule today.`;

                                let pic_path = '';

                                if (rnNoti.media) {
                                    pic_path = config.SERVER_URL + '/pets/getPetProPic/' + rnNoti.media._id;
                                }

                                const fn = new OneSignal.Notification({
                                    headings: {
                                        en: 'PetNetwork'
                                    },
                                    contents: {
                                        en: description
                                    },
                                    priority: 10,
                                    large_icon: config.SERVER_URL + '/owners/profile_pic/' + rnNoti.pet._id,
                                    big_picture: pic_path,
                                    include_player_ids: background_playerIds,

                                });

                                try {
                                    const push_response = await myClient.sendNotification(fn);
                                } catch (error) {
                                    console.log(error);
                                }
                            }
                        } else {
                            console.log("no background")
                        }
                        //for tomorrow reminder
                    } else if (savedDay == currentDay + 1) {

                        const rnNewNoti = await newNoti.save();

                        let rnNoti = await Notification.findById(rnNewNoti._id)
                            .populate({
                                path: 'pet',
                                select: 'petName petProPic reminder',
                                populate: {
                                    path: "reminder",
                                    select: "date type"
                                },
                            })
                            .populate('media', 'contentType')
                            .exec()

                        const petOwnerId = reminder[i].pet.owner

                        const noti_subscriber = getAllSubscriber(noties_socket);

                        for (let i = 0, len = noti_subscriber.length; i < len; i++) {

                            const { each_socket, owner_id } = noti_subscriber[i];

                            if (owner_id == petOwnerId) {
                                rnNoti && each_socket.emit('noti::created', rnNoti);
                            }
                        }

                        let petOwner = await Owner.findById(petOwnerId).exec()

                        if (petOwner) {
                            const playerIds = petOwner.playerIds;

                            for (let j of playerIds) {
                                const { playerId, status } = j;
                                if (status === 'background' || status === 'inactive') {
                                    background_playerIds.push(playerId);
                                }
                            }
                        }

                        petOwner.notiLists.push(rnNoti._id);

                        await petOwner.save();

                        if (background_playerIds.length >= 1) {
                            if (rnNoti) {
                                const description = reminder[i].pet.petName + ` has ${hygiene_type} schedule tomorrow.`;
                                let pic_path = '';
                                if (rnNoti.media) {
                                    pic_path = config.SERVER_URL + '/pets/getPetProPic/' + rnNoti.media._id;
                                }

                                const fn = new OneSignal.Notification({
                                    headings: {
                                        en: 'PetNetwork'
                                    },
                                    contents: {
                                        en: description
                                    },
                                    priority: 10,
                                    ///profile_pic/:ownerId"
                                    large_icon: config.SERVER_URL + '/owners/profile_pic/' + rnNoti.pet._id,
                                    big_picture: pic_path,
                                    include_player_ids: background_playerIds,

                                });

                                try {
                                    const push_response = await myClient.sendNotification(fn);
                                } catch (error) {
                                    console.log(error);
                                }
                            }

                        } else {
                            console.log("no background")
                        }

                    }
                }
            }
        }

    } catch (error) {
        console.log("error", error)
    }
});

app.use(morgan('dev'));
app.set('view engine', 'ejs');
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    req.onesignal_client = myClient;
    req.io = io;
    //for posts
    req.all_posts_socket = all_posts_socket;
    req.follower_posts_socket = follower_posts_socket;
    //to track likes,dislikes and comments count
    req.likes_socket = likes_socket;
    //for noti
    req.noties_socket = noties_socket;
    //for chat
    req.chat_socket = chat_socket;
    next();
})

app.use("/owners", ownerRouter);
app.use("/vets", vetRouter);
app.use('/posts', postRouter);
app.use("/articles", articleRouter);
app.use('/events', eventRouter);
app.use("/pets", petRouter);
app.use("/notifications", notiRouter);
app.use("/comments", commentRouter);
app.use("/chats", chatRouter);
app.use('/web', webRouter);


module.exports = { app, server };
