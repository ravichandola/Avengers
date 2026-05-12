# Remote JMeter worker (server mode) — scale horizontally; controller drives test plan.
FROM eclipse-temurin:21-jre-jammy

ARG JMETER_VERSION=5.6.3
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" \
  | tar xz -C /opt \
  && ln -s "/opt/apache-jmeter-${JMETER_VERSION}" /opt/jmeter

ENV JMETER_HOME=/opt/jmeter
WORKDIR ${JMETER_HOME}

EXPOSE 1099 50000

# Configure firewall / security groups for 1099 + ephemeral range in production.
CMD ["bin/jmeter-server"]
