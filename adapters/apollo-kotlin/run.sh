#!/bin/sh
# Runs the Apollo Kotlin adapter. Build it first: mvn -q package (see README.md).
# Uses $JAVA_HOME/bin/java if JAVA_HOME is set, otherwise java on PATH (21+).
dir=$(cd "$(dirname "$0")" && pwd)
java=java
[ -n "$JAVA_HOME" ] && java="$JAVA_HOME/bin/java"
exec "$java" -jar "$dir/target/apollo-kotlin-adapter.jar" "$@"
