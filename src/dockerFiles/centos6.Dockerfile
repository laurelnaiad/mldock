ARG osImage

FROM $osImage

RUN     mkdir -p /var/opt/MarkLogic && \
        chown daemon.daemon /var/opt/MarkLogic && \
        chmod ug+rwx /var/opt/MarkLogic && \
        yum clean expire-cache && \
        yum -y install bash.x86_64 \
        glibc.i686 glibc.x86_64 gdb.x86_64 libgcc.x86_64 libstdc++.x86_64 cyrus-sasl-lib.x86_64 \
        redhat-lsb-core.x86_64 redhat-lsb-printing.x86_64 \
        initscripts && \
        yum clean all

LABEL   name="mldock: CentOS6-compatible (mldock)" \
        vendor="https://githhub.com/laurelnaiad" \
        license=MIT \
        description="Base image for mldock MarkLogic Server images requiring a CentOS6-compatible host."
CMD []
