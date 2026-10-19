# K31 agent environment template. One generated file per agent under
# $SCRATCH/env/activate-<name>.sh; the agent's prompt tells it to `source`
# its file once before working. Two substitutions: @SHIM@ (the PATH shim
# dir, POSIX style) and @LOG@ (that agent's gh-start log, C:/ style so both
# bash and cmd redirections resolve it).
export PATH="@SHIM@:$PATH"
export K31_GH_LOG="C:/Users/shout/AppData/Local/Temp/box-k31/gh-logs/@NAME@.jsonl"
# Machine agents only: the box wrapper bakes this too; exporting it keeps
# any direct `node .../box.js` call safe as well.
# @SETTINGS_LINE@
