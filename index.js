const config = require("./config.json");
const express = require("express");
const cors = require("cors");
const path = require("path");
const handlebars = require("express-handlebars");
const expressSession = require("express-session");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Web App Setup
const app = express();
const session_middleware = expressSession({
    secret: process.env.TOKEN_KEY,
    resave: true,
    saveUninitialized: true
});
// Session Cookies
app.use(
    cookieSession({
        name: config.session_name,
        secret: process.env.TOKEN_KEY,
        keys: [process.env.TOKEN_KEY],
        maxAge: config.max_session_age
    })
);
app.use(cors());
app.use(function (req, res, next) {
    site_url = "https://" + req.get("host");
    //res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Origin", site_url);
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
});
var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session_middleware);

//Handlebars engine setup
app.engine(".html", handlebars.engine({
    extname: ".html",
    defaultLayout: "main",
    partialsDir: __dirname + "/views/partials/",
    helpers: {
        json: (context) => {
            return JSON.stringify(context);
        }
    }
}));
app.set("view engine", ".html");

//Static Folder
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

//Sockets
const http = require("http");
const server = http.Server(app);
const PORT = config.port;

const sockets = require("socket.io");
//io = sockets(server);
options = {
    cors: true,
    origins: ["*"],
}
const io = require("socket.io")(server, options);
io.use(require("express-socket.io-session")(session_middleware, {
    autoSave: true
}));

// Web Routes - MUST BE IN LAST
require("./routes/web.route.js")(app);

server.listen(PORT, async () => {
    console.log(`Server up! Listening on :${PORT}.`);
});



const users = {};
const points = {};
const update_time = 20;
const max_name = 24;
const max_chat = 256;
io.on("connection", async (socket) => {
    var user = null;
    var disconnected = false;
    socket.on("join", async (data) => {
        if (disconnected) return;

        users[socket.id] = {
            id: socket.id,
            username: (data.username || "Anonymous").substring(0, max_name),
            last_update: 0,
            x: 50,
            y: 50
        };
        user = users[socket.id];

        if (Object.values(users).find(u => u.username == user.username && u.id != user.id)) {
            let i = 0;
            do {
                i++;
            } while (Object.values(users).find(u => u.username == data.username + i && u.id != user.id));
            user.username = data.username + i;
        }
    
        socket.emit("init", {
            users: users,
            points: points
        });
        socket.broadcast.emit("userJoined", user);
    });

    socket.on("userUpdate", (data) => {
        if (!user) return;

        var prev_user = JSON.stringify(user);
        user.username = (data.username || user.username).substring(0, max_name);

        if (JSON.stringify(user) != prev_user) {
            io.emit("userUpdated", user);
        }
    });

    socket.on("cursor", async (data) => {
        if (!user) return;

        let now = Date.now();
        if (now - user.last_update < update_time) return;

        user.last_update = now;
        user.x = data.x ?? user.x;
        user.y = data.y ?? user.y;

        points[now] = [user.x, user.y, data.color ?? null, data.width ?? 5];
        io.emit("cursor", { // send to all users but self
            user: user,
            color: data.color ?? null,
            width: data.width ?? 5,
        });
    });

    socket.on("chat", async (message) => {
        if (!message) return;

        io.emit("chat", {
            user: user,
            message: message.substring(0, max_chat)
        })
    });

    socket.on("disconnect", async () => {
        socket.broadcast.emit("userLeft", socket.id);
        delete users[socket.id];
        disconnected = true;
    });
});