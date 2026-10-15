import app from "./app.js";
import { config } from "./config.js";
import { startExpiryReminders } from "./services/mailer.service.js";

app.listen(config.PORT, () => {
  console.info(`Careergrill API listening on port ${config.PORT}.`);
  startExpiryReminders();
});
