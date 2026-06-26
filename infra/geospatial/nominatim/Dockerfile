FROM mediagis/nominatim:5.3

RUN apt-get update \
  && apt-get install -y --no-install-recommends osmium-tool curl nginx gettext-base \
  && rm -rf /var/lib/apt/lists/*

ENV PORT=8080
ENV IMPORT_REGION=salta
ENV SALTA_EXTRACT=true
ENV SALTA_BBOX=-68.75,-26.62,-62.00,-21.78
ENV CAPITAL_BBOX=-65.55,-24.90,-65.30,-24.70
ENV IMPORT_WIKIPEDIA=false
ENV IMPORT_US_TIGER=false
ENV IMPORT_GB_POSTCODES=false
ENV FREEZE=true
ENV WARMUP_ON_STARTUP=false
ENV IMPORT_STYLE=address
ENV USER_AGENT=ProfesionalApp-Nominatim/1.0
ENV RAILWAY_RUN_UID=0
ENV GUNICORN_WORKERS=1
ENV CACHE_ENABLED=true
ENV NOMINATIM_BACKEND_PORT=8081

COPY entrypoint.sh /entrypoint.sh
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx-site.conf.template /etc/nginx/templates/site.conf.template
COPY start-nginx-cache.sh /usr/local/bin/start-nginx-cache.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/start-nginx-cache.sh

ENTRYPOINT ["/entrypoint.sh"]
