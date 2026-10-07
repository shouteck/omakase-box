# click-3840

Repository: pallets/click · Issue #3840 · Group: open · Created: 2026-09-05T13:49:09Z
Labels: none · Reporter's role: NONE

## Title

`click.edit` on Windows throws WinError 14001 or 87

## Body

I found this bug while testing my own Click application. In about half the times `click.edit()` is attempted on Windows, `notepad.exe` will fail to launch with one of these two error messages (output under spoilers):

<details>
<summary>OSError: [WinError 87] The parameter is incorrect</summary>

```
PS C:\Users\Emory> python .\click-notepad-me.py
Traceback (most recent call last):
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 729, in edit_files
    c = subprocess.Popen(
        args=shlex.split(editor) + list(filenames),
        env=environ,
    )
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\subprocess.py", line 1038, in __init__
    self._execute_child(args, executable, preexec_fn, close_fds,
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                        pass_fds, cwd, env,
                        ^^^^^^^^^^^^^^^^^^^
    ...<5 lines>...
                        gid, gids, uid, umask,
                        ^^^^^^^^^^^^^^^^^^^^^^
                        start_new_session, process_group)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\subprocess.py", line 1552, in _execute_child
    hp, ht, pid, tid = _winapi.CreateProcess(executable, args,
                       ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^
                             # no special security
                             ^^^^^^^^^^^^^^^^^^^^^
    ...<4 lines>...
                             cwd,
                             ^^^^
                             startupinfo)
                             ^^^^^^^^^^^^
OSError: [WinError 87] The parameter is incorrect

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "C:\Users\Emory\click-notepad-me.py", line 3, in <module>
    _ = click.edit()
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\termui.py", line 904, in edit
    return ed.edit(text)
           ~~~~~~~^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 783, in edit
    self.edit_files((name,))
    ~~~~~~~~~~~~~~~^^^^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 739, in edit_files
    raise ClickException(
        _("{editor}: Editing failed: {e}").format(editor=editor, e=e)
    ) from e
click.exceptions.ClickException: notepad: Editing failed: [WinError 87] The parameter is incorrect
```
</details>

or

<details>
<summary>OSError: [WinError 14001] The application has failed to start because its side-by-side configuration is incorrect. Please see the application event log or use the command-line sxstrace.exe tool for more detail</summary>

```
PS C:\Users\Emory> python .\click-notepad-me.py
Traceback (most recent call last):
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 729, in edit_files
    c = subprocess.Popen(
        args=shlex.split(editor) + list(filenames),
        env=environ,
    )
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\subprocess.py", line 1038, in __init__
    self._execute_child(args, executable, preexec_fn, close_fds,
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                        pass_fds, cwd, env,
                        ^^^^^^^^^^^^^^^^^^^
    ...<5 lines>...
                        gid, gids, uid, umask,
                        ^^^^^^^^^^^^^^^^^^^^^^
                        start_new_session, process_group)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\subprocess.py", line 1552, in _execute_child
    hp, ht, pid, tid = _winapi.CreateProcess(executable, args,
                       ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^
                             # no special security
                             ^^^^^^^^^^^^^^^^^^^^^
    ...<4 lines>...
                             cwd,
                             ^^^^
                             startupinfo)
                             ^^^^^^^^^^^^
OSError: [WinError 14001] The application has failed to start because its side-by-side configuration is incorrect. Please see the application event log or use the command-line sxstrace.exe tool for more detail

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "C:\Users\Emory\click-notepad-me.py", line 3, in <module>
    _ = click.edit()
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\termui.py", line 904, in edit
    return ed.edit(text)
           ~~~~~~~^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 783, in edit
    self.edit_files((name,))
    ~~~~~~~~~~~~~~~^^^^^^^^^
  File "C:\Users\Emory\AppData\Local\Python\pythoncore-3.14-64\Lib\site-packages\click\_termui_impl.py", line 739, in edit_files
    raise ClickException(
        _("{editor}: Editing failed: {e}").format(editor=editor, e=e)
    ) from e
click.exceptions.ClickException: notepad: Editing failed: [WinError 14001] The application has failed to start because its side-by-side configuration is incorrect. Please see the application event log or use the command-line sxstrace.exe tool for more detail
```
</details>

To replicate, run this script until you get one of these:

```py
import click
_ = click.edit()
print("If you got here, no crash occurred")
```

Environment:

- Python version: 3.12.14 / also reproduced on my system 3.14 install
- Click version: 8.5.0
- OS: Windows 11 (64-bit)


## Comments (1)

### Comment 1 · NONE · 2026-09-14T10:48:34Z

I tried recreating the issue on my own system: `windows 11 build number (26100.9445)`, `python version 3.14`, and also checked for Notepad execution alias toggle which was default nothing to change, but I couldn't recreate it , tested it for for total 30 iterations no failures not even one.
Then I investigated the issue from different paths, and perspectives : first - I tired to crosscheck shlex working and how it is used in the codebase, as `shlex` is based on unix systems, so it treats backslashes differently which can cause an error but as 'notepad' passed directly Nothing could be wrong here( it’s single string so no split), and environment which was passed in click function, was just copy of original one Nothing changed.So that completely eliminated any parsing issue, or conditional check issue as error messages suggested.
So next thing i dig up was, windows error which were mentioned : `INVALID_PARAMETER` and `ERROR_SXS_CANT_GEN_ACTCTX`, I explored few articles on this , one was completely related to this ( it is from Microsoft's own Q&A platform) , and it’s main point was that crash inside a specific alias-resolution dll, is inconsistent or random getting 4 times out of 10 time failures( same condition as described in the this issue description ), but it pointed to alias thing which again i tried to debug and analyse it ( as many users have experience this issue, regarding notepad specifically in windows).
And as i couldn't recreate the error, it is currently too vague
[cut here: 475 more characters]
