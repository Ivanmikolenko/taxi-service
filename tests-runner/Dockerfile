FROM selenium/standalone-chrome:4.49.0

USER root
RUN pip install selenium requests pytest pytest-xdist
RUN mkdir -p /app

COPY ./parser.bin /usr/bin/parser.bin
COPY ./test.sh /usr/bin/test.sh

CMD ["/usr/bin/test.sh"]
