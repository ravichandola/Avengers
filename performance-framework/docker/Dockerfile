# Controller image: Node orchestration + JMeter non-GUI runtime
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends default-jre-headless curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG JMETER_VERSION=5.6.3
RUN curl -fsSL "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" \
  | tar xz -C /opt \
  && ln -s "/opt/apache-jmeter-${JMETER_VERSION}" /opt/jmeter

ENV JMETER_HOME=/opt/jmeter
ENV PATH="${JMETER_HOME}/bin:${PATH}"

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY contracts ./contracts
RUN npm run build

ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/cli/perf.js"]
