(async () => {
    if (!localStorage.username) localStorage.username = prompt("Enter a username!") || "Anonymous";

    const socket = io();
    const canvas = document.querySelector("#canvas");
    const user_list = document.querySelector("#user-list");
    const chat_list = document.querySelector("#chat-list");
    const chat_box = document.querySelector("#chat-box");
    const color_picker = document.querySelector("#color");
    const width_slider = document.querySelector("#width");
    const eraser = document.querySelector("#eraser");
    const ctx = canvas.getContext("2d");
    
    const interpolation = 0.5;
    const fps = 60;
    const cursor_size = 15;

    var users = {};
    var points = {}; // This will now store points for each user separately
    var chat = [];
    var keys = {};
    var mouse_is_down = false;
    var using_eraser = false;
    var color = color_picker.value;
    var point_radius = width_slider.value;

    const cursor_img = document.createElement("img");
    cursor_img.src = "/assets/cursor.png";

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    function updateUserList() {
        var html = "";
        for (let [id, user] of Object.entries(users)) {
            html += `
                <button class="user ${id == socket.id ? "me" : ""}">${user.username}</button>
            `;
        }
        user_list.innerHTML = html;
        
        document.querySelector(".me")?.addEventListener("click", () => {
            localStorage.username = prompt("Enter a username!") || localStorage.username;
            socket.emit("userUpdate", {
                username: localStorage.username
            });
        });
    }

    function updateUserPositions() {
        for (let [id, user] of Object.entries(users)) {
            user.displayX = lerp(user.displayX, user.targetX, interpolation);
            user.displayY = lerp(user.displayY, user.targetY, interpolation);
        }
    }

    function render() {
        clearCanvas(); // Clear the canvas before rendering

        // Render points for each user
        for (let [id, userPoints] of Object.entries(points)) {
            let last_x = null;
            let last_y = null;
            for (let [x, y, point_color, point_width] of userPoints) {
                if (!point_color) {
                    last_x = null;
                    last_y = null;
                    continue;
                }

                ctx.beginPath();
                ctx.arc(
                    x * window.innerWidth / 100,
                    y * window.innerHeight / 100,
                    point_width, 0,
                    2 * Math.PI, false
                );
                ctx.fillStyle = point_color;
                ctx.strokeStyle = point_color;
                ctx.fill();

                if (last_x !== null && last_y !== null) {
                    ctx.beginPath();
                    ctx.moveTo(last_x * window.innerWidth / 100, last_y * window.innerHeight / 100);
                    ctx.lineTo(x * window.innerWidth / 100, y * window.innerHeight / 100);
                    ctx.lineWidth = point_width * 2;
                    ctx.stroke();
                }

                last_x = x;
                last_y = y;
            }
        }

        // Render user cursors
        for (let [id, user] of Object.entries(users)) {
            if (user.id == socket.id) continue;
            ctx.drawImage(
                cursor_img,
                user.displayX * window.innerWidth / 100,
                user.displayY * window.innerHeight / 100,
                cursor_size, cursor_size * cursor_img.height / cursor_img.width
            );
            ctx.fillStyle = "black";
            ctx.fillText(user.username, user.displayX * window.innerWidth / 100 + cursor_size, user.displayY * window.innerHeight / 100 + cursor_size);
        }
    }

    socket.on("connect", async () => {
        socket.emit("join", {
            username: localStorage.username
        });
    });

    setInterval(() => {
        ctx.canvas.width = window.innerWidth;
        ctx.canvas.height = window.innerHeight;
        clearCanvas();
        updateUserPositions();
        render();
    }, 1000 / fps);

    document.body.addEventListener("mousemove", async (e) => {
        if (e.target != document.body) return;
        
        socket.emit("cursor", {
            color: mouse_is_down ? color : null,
            x: e.x / window.innerWidth * 100, // percentage of screen
            y: e.y / window.innerHeight * 100,
            width: point_radius * (using_eraser ? 1.5 : 1)
        });
    });

    document.body.addEventListener("mousedown", async (e) => {
        if (e.target != document.body || document.activeElement == chat_box) return;

        mouse_is_down = true;
        socket.emit("cursor", {
            x: e.x / window.innerWidth * 100, // percentage of screen
            y: e.y / window.innerHeight * 100,
            color: mouse_is_down ? color : null,
            width: point_radius * (using_eraser ? 1.5 : 1)
        });
    });

    document.addEventListener("mouseup", () => {
        mouse_is_down = false;
    });

    window.addEventListener("keydown", async (e) => {
        if (keys[e.key]) return;
        keys[e.key] = true;
        if (e.key == "Enter") {
            document.activeElement == chat_box ? chat_box.blur() : chat_box.focus();
        }
    });

    window.addEventListener("keyup", async (e) => {
        keys[e.key] = false;
    });

    chat_box.addEventListener("keydown", async (e) => {
        if (e.key == "Enter") {
            socket.emit("chat", chat_box.value);
            chat_box.value = "";
            document.activeElement.blur();
        }
    });

    chat_box.addEventListener("focus", () => {
        chat_list.style["-webkit-mask-image"] = "none";
    });

    chat_box.addEventListener("blur", () => {
        chat_list.style["-webkit-mask-image"] = "-webkit-gradient(linear, left bottom, right top, from(rgba(0,0,0,0.7)), to(rgba(0,0,0,0)))";
    });

    color_picker.addEventListener("input", () => {
        color = color_picker.value;
        using_eraser = false;
        eraser.src = "/assets/eraser.png";
    });

    width_slider.addEventListener("input", () => {
        point_radius = width_slider.value;
    });

    eraser.addEventListener("click", () => {
        using_eraser = !using_eraser;
        eraser.src = using_eraser ? "/assets/pencil.png" : "/assets/eraser.png";
        color = using_eraser ? "#ffffff" : color_picker.value;
    });

    socket.on("init", async ({ users: init_users, points: init_points }) => {
        users = {};
        points = init_points; // Reset points for each user
        for (let id in init_users) {
            users[id] = {
                ...init_users[id],
                displayX: init_users[id].x,
                displayY: init_users[id].y,
                targetX: init_users[id].x,
                targetY: init_users[id].y,
            };
            points[id] ??= []; // Initialize an empty array for this user's points
        }

        updateUserList();
    });

    socket.on("userJoined", async (user) => {
        users[user.id] = {
            ...user,
            displayX: user.x,
            displayY: user.y,
            targetX: user.x,
            targetY: user.y,
        };
        points[user.id] = []; // Initialize points for the new user
        updateUserList();
    });

    socket.on("userUpdated", async (user) => {
        users[user.id] = {
            ...user,
            displayX: user.x,
            displayY: user.y,
            targetX: user.x,
            targetY: user.y,
        };
        updateUserList();
    });

    socket.on("userLeft", async (id) => {
        delete users[id];
        delete points[id]; // Clean up points for the disconnected user
        updateUserList();
    });

    socket.on("cursor", async ({ user, color, width }) => {
        if (users[user.id]) {
            users[user.id].targetX = user.x; // Update targetX
            users[user.id].targetY = user.y; // Update targetY
    
            // Store the cursor points for the specific user
            if (!points[user.id]) {
                points[user.id] = []; // Initialize if not already present
            }
            points[user.id].push([user.x, user.y, color, width]);
        }
    });

    socket.on("chat", async (data) => {
        chat.push(data);
        let html = "";
        for (let data of chat) {
            html += `
                <div class="chat">[${data.user.username}]: ${data.message}</div>
            `;
        }
        chat_list.innerHTML = html;
    });
})();
