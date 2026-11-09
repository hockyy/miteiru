# Independent LLM annotator agreement

Untouched annotations, before adjudication. Model/model agreement is not human-validated accuracy.

| Variant | Lines | Boundary F1 | Exact agreement | Disagreements |
| --- | ---: | ---: | ---: | ---: |
| ja | 300 | 98.18% | 83.33% | 50 |
| zh-Hans | 300 | 99.45% | 90.67% | 28 |
| zh-Hant | 300 | 98.96% | 83.00% | 51 |
| yue | 300 | 99.44% | 89.33% | 32 |

## By split

| Scope | Lines | Boundary P | Boundary R | Boundary F1 | Exact lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| ja dev | 150 | 99.31% | 97.02% | 98.15% | 82.67% |
| ja test | 150 | 99.90% | 96.56% | 98.21% | 84.00% |
| zh-Hans dev | 150 | 99.79% | 99.18% | 99.48% | 91.33% |
| zh-Hans test | 150 | 99.72% | 99.10% | 99.41% | 90.00% |
| zh-Hant dev | 150 | 99.94% | 97.80% | 98.86% | 80.00% |
| zh-Hant test | 150 | 99.62% | 98.51% | 99.07% | 86.00% |
| yue dev | 150 | 99.62% | 99.05% | 99.33% | 88.00% |
| yue test | 150 | 99.68% | 99.43% | 99.55% | 90.67% |
