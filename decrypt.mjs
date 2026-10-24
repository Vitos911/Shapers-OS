import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
const [encryptedPath,keyPath,outputPath]=process.argv.slice(2);
if(!encryptedPath||!keyPath||!outputPath)throw Error("Usage: node decrypt.mjs backup.enc recovery.key restored.zip");
if(fs.existsSync(outputPath))throw Error("Output already exists; choose a new path");
const raw=fs.readFileSync(encryptedPath);
if(raw.subarray(0,8).toString("ascii")!=="SHPRSBK1")throw Error("Unsupported backup format");
const key=Buffer.from(fs.readFileSync(keyPath,"utf8").trim(),"hex");
if(key.length!==32)throw Error("Invalid recovery key");
const decipher=crypto.createDecipheriv("aes-256-gcm",key,raw.subarray(8,20));
decipher.setAuthTag(raw.subarray(20,36));
const plaintext=Buffer.concat([decipher.update(raw.subarray(36)),decipher.final()]);
fs.writeFileSync(outputPath,plaintext,{flag:"wx",mode:0o600});
console.log("Decrypted archive: "+path.resolve(outputPath));

