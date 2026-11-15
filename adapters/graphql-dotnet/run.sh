#!/bin/sh
# Runs the built adapter. Build it first: dotnet build -c Release (see README.md).
# Uses `dotnet` from PATH, or DOTNET_ROOT/dotnet if DOTNET_ROOT is set.
# Arguments are passed on to the adapter (--no-idle, --inline-items).
dir=$(cd "$(dirname "$0")" && pwd)
dotnet=dotnet
if [ -n "$DOTNET_ROOT" ] && [ -x "$DOTNET_ROOT/dotnet" ]; then dotnet="$DOTNET_ROOT/dotnet"; fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
exec "$dotnet" "$dir/bin/Release/net8.0/GraphQLDotnetAdapter.dll" "$@"
