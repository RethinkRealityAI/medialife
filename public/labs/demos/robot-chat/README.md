# Talk to Misa (robot-chat)

Source: the legacy 8th Wall sample project `chatbot` (A-Frame or three.js), rebuilt in plain three.js on the shared
Labs shell (`../shared/`). What was kept and what changed is written at the top of `main.js`.

Assets (in `../media/`): misa.glb (from the sample, meshopt + webp).

Credits: Misa character model from the chatbot sample. The reply engine is a LOCAL scripted bot: no API key ships. The sample called OpenAI from the browser through a hosted secret slot; to use a real model, run the page with `?bot=/api/your-route` (or set CHAT_ENDPOINT in main.js) pointing at a server route that holds the key and answers POST {message, history} -> {reply, emotion}. SYSTEM_PROMPT in main.js is the persona to use there.

Engine: 8th Wall engine binary 1.0.0 (world tracking), three.js r180. Licences are on the Licences page (menu > Licences, `/evade/licences/`), never on screen.

Status: simulator-tested only (headless Chromium, fake camera, faked motion). Not tested on a phone yet.
