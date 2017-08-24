# given credentials & raw url, downloads a MarkLogic rpm
# $1 email address of MarkLogic developer acct
# $2 password of MarkLogic developer acct
# $3 raw url to download rpm file
# $4 output file
# $5 optional sha1 checksum

curl -X POST -s \
    -c developer.marklogic.jar \
    --data-urlencode "email=$1" --data-urlencode "password=$2" --data-urlencode "asset=$3" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    https://developer.marklogic.com/login

MLDOWNLOADURL=$(curl -s -X POST \
    -b developer.marklogic.jar \
    --data-urlencode "download=$3" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    https://developer.marklogic.com/get-download-url \
    | jq -r '.path')

echo ""
echo "downloading MarkLogic from $MLDOWNLOADURL"

wget -O $4 --progress=bar:force $MLDOWNLOADURL
rm -f developer.marklogic.jar

if [[ -n $5 ]]; then
    SHA=$(sha1sum "$4" | awk '{print $1;}' )
    if [[ $SHA -ne $5 ]]; then
        echo "Checksum failed. Expected $5, calculated $SHA"
        exit 1
    else
        echo "Checksum checks. $5, $SHA"
    fi
fi
