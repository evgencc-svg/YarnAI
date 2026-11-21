# YarnAI — архитектурные риски

Статус: **PROPOSAL FOR DISCUSSION**. Это реестр для обсуждения, а не утверждённая оценка.

## 1. Критические риски исходной модели

| ID | Риск | Проявление через 3–5 лет | Предложение |
|---|---|---|---|
| R-01 | Universal State | один enum управляет UX, project, artifact и learning | разделить четыре lifecycle/projection |
| R-02 | Item ambiguity | невозможно отличить модель от физической вещи | Definition + Artifact + Workpiece |
| R-03 | Project owns everything | giant aggregate, блокирующий независимое развитие | bounded contexts и references |
| R-04 | Pattern as content | несогласованные text/chart/video и неверный пересчёт | formal Pattern Model + compiled views |
| R-05 | Transcript as context | потеря истины при summary/model change | event/evidence/domain records |
| R-06 | Decision/Scenario/Recommendation overlap | три владельца одного next step | planner → decision → recommendation → explanation |
| R-07 | Memory as entity-copy | устаревшие дубли и privacy debt | scoped pointers + provenance/consent |
| R-08 | Intent-first absolutism | медленная/опасная реакция в critical case | safety/context/goal достаточны до action |
| R-09 | CV becomes diagnosis | фото автоматически портит twin/learning | observation-verification separation |
| R-10 | confidence as score | ложная точность и плохая calibration | claim+evidence+consequence assessment |

## 2. SOLID-риски

### SRP

Текущий Decision Engine одновременно восстанавливает контекст, определяет Intent/State, оценивает уверенность, выбирает вариант, рекомендует, проверяет результат и обновляет Learning State. Это orchestration, а не одна доменная ответственность.

Предложение: Decision Engine владеет только Decision Case; orchestration координирует независимые engines.

### Open/Closed

Список Intent/State, пришитый к Scenario, затруднит crochet, machine knitting и sewing. Расширение craft должно добавлять vocabularies/rules/operations, а не менять ядро Project/User.

### Liskov

Если `Item` подменяется swatch, sweater, repair или machine output, общие инварианты распадаются. Нужна явная taxonomy Definition/Artifact/Specimen, а не наследование «всё Item».

### Interface Segregation на уровне домена

Каждая подсистема должна получать минимальный context package. Передача полного `Memory/Project Context` создаёт скрытую зависимость от всех сущностей.

### Dependency Inversion

Доменные решения не должны зависеть от конкретной LLM/CV модели, формата prompt или текста explanation. Модели производят candidates/evidence, а доменные правила принимают их через стабильные понятия.

## 3. DDD-риски

### Слабые bounded contexts

`Memory`, `State`, `Scenario` и `Recommendation` сейчас используются как горизонтальные универсальные понятия. Без владельца языка они станут shared mutable model.

### Anemic domain

Если сущности останутся списками «что может содержать», инварианты уйдут в prompt. Prompt станет фактическим доменом без versioning/testability.

### Giant shared kernel

Один GLOSSARY для всех contexts полезен для ориентации, но термин `State`, `Pattern`, `Skill`, `Item` должен иметь bounded meaning. Иначе команды будут спорить о значении одного слова.

### Aggregate overreach

Project, содержащий photos, pattern, item, history, progress, mistakes и learning, не масштабируется ни концептуально, ни организационно.

## 4. Риски цифрового двойника

- обещать точность выше качества evidence;
- делать 3D/render источником истины;
- автоматически синхронизировать planned и built, скрывая deviation;
- не различать неизвестное и совпавшее;
- обновлять design задним числом под фактический дефект;
- хранить только latest state без lineage;
- считать одну фотографию полной моделью Artifact.

## 5. Риски AI

### Model drift

Одинаковый input после обновления модели даёт другое observation/plan. Все derived artifacts требуют model/method provenance и возможности воспроизвести прошлое решение по сохранённому evidence.

### Hallucinated completeness

Длинный plan создаёт впечатление покрытия. Completeness должна определяться requirement/operation coverage, а не текстом.

### Correlated validation

«Вторая AI-модель проверила первую» не является независимым evidence, если модели разделяют данные/ошибки. Нужны formal checks, measurements и физические checkpoints.

### Bias toward supported catalog

Intent Engine может неверно интерпретировать запрос так, чтобы выбрать доступный Scenario. Независимая граница Intent защищает от этого.

## 6. Риски данных и памяти

- чувствительные body measurements и photos;
- неясный consent на cross-project memory;
- невозможность исправить model inference;
- orphaned media без purpose;
- IP/лицензионный риск reference/pattern;
- retention навсегда «для улучшения»;
- смешение нескольких людей/получателей изделий в User profile;
- evidence poisoning ошибочным пользовательским подтверждением.

## 7. Риски продукта

- универсальная платформа до доказанного vertical slice;
- обещание сопровождения «до конца» без определения D-003;
- одновременно beginner и professional UX без shared domain accuracy;
- acceptance criteria формируются после результата;
- платная рекомендация без гарантированного verification path;
- catalog growth опережает provenance и quality;
- обучение зависимости от продукта вместо самостоятельности.

## 8. Риски материалов и физической реальности

- неизвестная партия, влажность, обработка, износ инструмента;
- gauge изменяется у одного человека во времени;
- свойства после блокировки не выводятся из этикетки;
- tactile qualities плохо наблюдаются камерой;
- расход зависит от реального исполнения;
- один Pattern может быть безопасен только в узком диапазоне параметров.

## 9. Риски change management

Если пользователь меняет размер/пряжу/горловину после начала:

- прежние counts становятся неверными;
- часть Artifact уже необратима;
- materials estimate устаревает;
- checkpoints теряют применимость;
- learning explanation может ссылаться на старую operation.

Без Change Set и impact analysis система создаст тихий технический долг непосредственно в физической вещи.

## 10. Организационные риски

- команды по AI, content и product создают собственные версии истины;
- «временно» дублируют Project context в каждом engine;
- microservices раньше domain boundaries;
- prompt ownership заменяет domain ownership;
- метрики engagement конфликтуют с safe refusal;
- никто не владеет completion/verification end-to-end.

## 11. Риски предложенной целевой архитектуры

- слишком много понятий для ранней команды;
- bounded contexts могут стать бюрократией;
- immutable history усложняет correction UX;
- formal Pattern Model дорог и может задержать value;
- Digital Twin может быть переоценён раньше достаточного evidence;
- Decision/Confidence/Verification границы трудно объяснить;
- multi-craft abstraction может стать преждевременной.

Mitigation: реализовывать один vertical slice, но сохранять семантические границы; не создавать отдельные deployable units без необходимости.

## 12. Самые опасные будущие shortcut

1. Хранить всё в chat summary.
2. Сделать `Item.status` и считать его lifecycle.
3. Сохранять сгенерированный Pattern только PDF.
4. Давать CV право обновлять Current Step.
5. Использовать один confidence number.
6. Копировать facts в Memory.
7. Встраивать craft rules в prompts без provenance.
8. Исправлять выпущенный Pattern «на месте».
9. Считать user satisfaction единственным completion criterion.
10. Расширять ремёсла до доказательства knitting vertical slice.

