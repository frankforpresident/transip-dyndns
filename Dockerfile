FROM tarampampam/node:12.13-alpine

ADD package.json package.json

RUN apk add --no-cache make gcc g++ python && \
    npm install --prod && \
    npm cache clean --force && \
    apk del make gcc g++ python

ADD . .

CMD npm run start
