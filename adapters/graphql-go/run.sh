#!/bin/sh
# Runs the built graphql-go adapter. Build it first:
# go build -o bin/graphql-tla-graphql-go . (see README.md).
dir=$(cd "$(dirname "$0")" && pwd)
exec "$dir/bin/graphql-tla-graphql-go" "$@"
