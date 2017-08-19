# given credentials & raw url, downloads a MarkLogic rpm
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

wget -O $4 $MLDOWNLOADURL
rm -f developer.marklogic.jar
