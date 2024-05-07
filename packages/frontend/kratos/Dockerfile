FROM oryd/kratos:v0.13.0

ARG PATH_TO_KRATOS_CONFIG

COPY ./packages/frontend/kratos/scripts/entrypoint.sh /entrypoint.sh
COPY ${PATH_TO_KRATOS_CONFIG} /etc/config/kratos/kratos.yml
COPY ./packages/frontend/kratos/config/identity.schema.json /etc/config/kratos/identity.schema.json

ENTRYPOINT ["/entrypoint.sh"]
