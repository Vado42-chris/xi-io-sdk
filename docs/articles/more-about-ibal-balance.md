# More about @ibal balance tracking

@ibal balance is a small accounting primitive for opposing or reciprocal lanes. It prevents “looks balanced” from becoming an unmeasured claim.

```sh
xi-io ibal balance --left 12 --right 10 --unknown 3
```

The result reports left, right, unknown, known total, signed delta, absolute delta and ratio.

The important rule is `UNKNOWN != ZERO`. A numerically equal known pair is not balanced while unresolved cells remain. Likewise `BALANCED != CLOSED`: balance is an observation that another consumer may use, not authority to merge, deploy, publish or close work.

Use it for paired providers, yin/yang lanes, reciprocal returns, human/AI comparisons, or any two-sided denominator where hidden unknowns would otherwise disappear.
