ARG osImage
FROM $osImage

ARG rpmFile
COPY    $rpmFile MarkLogic.rpm

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
