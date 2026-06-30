import fs from "fs";
import path from "path";

// In Expo development, AsyncStorage on Android is stored in an SQLite DB
// or we can just print the console.log from the app using a quick React Native script.
// Wait, I can just modify groupStore.ts to console.log(_state) on start, or
// even better, just modify app/group/[id].tsx to console.log(tx, group.participants).
