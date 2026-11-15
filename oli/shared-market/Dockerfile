FROM node:22-alpine
WORKDIR /app
COPY market-core.js auth.js server.js ./
ENV PORT=8787 DATA_FILE=/data/market.json TRUST_PROXY=1
VOLUME /data
USER node
EXPOSE 8787
CMD ["node", "server.js"]
