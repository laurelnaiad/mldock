#!/usr/bin/env bash

# runner/signal trap for the MarkLogic server
# does very little (and doesn't error) if MarkLogic isn't (yet) installed)
#
# ala https://medium.com/@gchudnov/trapping-signals-in-docker-containers-7a57fdda7d86,
# courtesy Grigoriy Chudnov

set -x

pid=0

start_marklogic() {
  if [ -d /opt/MarkLogic ]
  then
    /etc/init.d/MarkLogic start
    sleep 1
    while ! [ -f /var/opt/MarkLogic/Logs/ErrorLog.txt ] ; do
        sleep .333
    done
  fi
}

stop_marklogic() {
  if [ -d /opt/MarkLogic ]
  then
    /etc/init.d/MarkLogic stop
    while [ -f /var/run/MarkLogic.pid ] ; do
      ps -lp $(cat /var/run/MarkLogic.pid)
      sleep .25
    done
  fi
}

# SIGTERM-handler
term_handler() {
  stop_marklogic
  exit 143; # 128 + 15 -- SIGTERM
}

# SIGHUP-handler
hup_handler() {
  stop_marklogic
  start_marklogic
}

start_marklogic

# setup handler
# on callback, kill the last background process, which is `tail -f /dev/null` and execute the specified handler
trap 'kill ${!}; term_handler' SIGTERM
trap 'kill ${!}; hup_handler' SIGHUP

# wait forever
while true
do
  tail -f /dev/null & wait ${!}
done
