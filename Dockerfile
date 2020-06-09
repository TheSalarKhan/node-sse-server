FROM node:10.15.3 AS stage-one

WORKDIR /service

# Copy package files and do npm install
COPY package.json package-lock.json ./

RUN npm install --only=production

# Copy code
COPY app.js lib.js ./

# Finally, specify command
CMD ["node", "./app.js"]
