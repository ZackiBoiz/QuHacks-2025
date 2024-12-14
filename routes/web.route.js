const config = require("../config.json");
module.exports = function(app) {
  app.get("/", function(req, res) {
    return res.status(200).render("home", {
      meta: {
        title: "QuHacks 2025!!",
      }
    });
  });
};