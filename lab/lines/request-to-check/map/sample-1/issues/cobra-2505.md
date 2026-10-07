# cobra-2505

Repository: spf13/cobra · Issue #2505 · Group: open · Created: 2026-09-23T23:17:08Z
Labels: none · Reporter's role: NONE

## Title

docs: cobra.dev broken Go snippets in "12-Factor App with Viper" tutorial

## Body

The [Building a 12-Factor App with Viper Integration](https://cobra.dev/docs/tutorials/12-factor-app/) tutorial has multiple instances of malformed shell and Go snippets.

In addition to the sections mentioned in #2322, the following Go snippet in **"Step 2: Defining Commands and Flags"** is broken.

Currently rendered as:

````
package cmd

import (
"fmt"
"os"
"[github.com/spf13/cobra](https://github.com/spf13/cobra)"
)

var (
// Used for flags.
cfgFile string

```
rootCmd = &cobra.Command{
	Use:   "myapp",
	Short: "A demo application for Cobra and Viper",
}
```

)
````

It doesn't compile: the import path is a Markdown link, and stray code fences are embedded inside the `var` block. Presumably intended:

````go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	// Used for flags.
	cfgFile string

	rootCmd = &cobra.Command{
		Use:   "myapp",
		Short: "A demo application for Cobra and Viper",
	}
)
````

## Comments (2)

### Comment 1 · NONE · 2026-10-06T11:06:32Z

Hi, I’d like to help fix the broken examples in this tutorial if it’s still available. I’d check the source Markdown and rendering, repair the malformed imports and code fences, and validate the complete example. Could you confirm which repository should receive the documentation PR? I noticed the related report in #2322 and would keep the fixes coordinated.

### Comment 2 · NONE · 2026-10-06T12:41:19Z

> Hi, I’d like to help fix the broken examples in this tutorial if it’s still available. I’d check the source Markdown and rendering, repair the malformed imports and code fences, and validate the complete example. Could you confirm which repository should receive the documentation PR? I noticed the related report in [#2322](https://github.com/spf13/cobra/issues/2322) and would keep the fixes coordinated.

hi, thank you, but as far as i know the doc site is no longer actively maintained, and also i can't find where it lives.
