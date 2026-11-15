#!/bin/sh
# Runs the graphql-ruby adapter. Install the gems first (see README.md).
# Uses $RUBY if set, otherwise ruby on PATH (3.1+).
dir=$(cd "$(dirname "$0")" && pwd)
export BUNDLE_GEMFILE="$dir/Gemfile" BUNDLE_PATH="$dir/vendor/bundle"
exec "${RUBY:-ruby}" "$dir/adapter.rb" "$@"
