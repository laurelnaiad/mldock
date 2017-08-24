ARG osImage
FROM $osImage as getter

COPY    mldownload.sh mldownload.sh
RUN     yum install -y curl openssl wget
RUN     wget -O jq --progress=bar:force https://github.com/stedolan/jq/releases/download/jq-1.5/jq-linux64 && \
        chmod ug+rwx ./jq ./mldownload.sh && mv jq /usr/bin
ARG rawUrl
ARG email
ARG password
ARG sha
RUN     ./mldownload.sh $email $password $rawUrl MarkLogic.rpm $sha



ARG osImage
FROM $osImage

COPY    --from=getter MarkLogic.rpm MarkLogic.rpm

COPY    mlrun.sh /usr/local/bin/mlrun.sh
RUN     chmod ug+rwx /usr/local/bin/mlrun.sh

RUN     yum install -y MarkLogic.rpm && \
        rm -f MarkLogic.rpm && \
        yum clean all

ARG version
LABEL   name="MarkLogic Server $version (mldock)" \
        vendor="https://githhub.com/laurelnaiad" \
        license=MIT \
        description="MarkLogic Server $version (MarkLogic Corporation) on $osImage."

EXPOSE      7997 7998 7999 8000 8001 8002
VOLUME      /var/opt/MarkLogic
ENTRYPOINT  [ "sh", "-c", "/usr/local/bin/mlrun.sh" ]
