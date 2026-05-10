import crypto from 'node:crypto';

const id = crypto.randomBytes(16).toString('hex');
console.log(id);
