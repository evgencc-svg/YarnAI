# YarnAI — предметная архитектура Computer Vision

Статус: **PROPOSAL FOR DISCUSSION**. Документ не выбирает модели, API, инфраструктуру или формат хранения.

## 1. Роль Computer Vision

CV — инструмент получения наблюдений из визуального evidence. Он не является Garment Engine, Verification Engine или Decision Engine.

Главный инвариант:

> Media Asset → Observation → Interpretation Hypothesis → Verification → Decision.

Ни один шаг нельзя скрыто пропустить.

## 2. Объекты домена Vision

### Evidence Asset

Неизменяемый оригинал фото/видео/кадра с author, time, capture context, consent, provenance и integrity. Crop/rotation/enhancement являются производными assets.

### Observation Request

Структурный вопрос к изображению: какой объект, участок, признак, масштаб, допустимые ответы и какое решение изменит результат.

Пример: не «проверь свитер», а «видны ли в отмеченном интервале 12 V-shaped stitch columns между маркерами?»

### Capture Protocol

Требования к evidence для данного Request: общий вид/макро, front/back, ориентация, scale reference, lighting, tension state, инструмент в кадре, несколько ракурсов или video.

### Capture Quality Assessment

Показывает, позволяет ли Asset ответить на Request: visibility, blur, occlusion, scale, orientation, color fidelity, temporal sufficiency.

### Region of Interest

Стабильная ссылка на наблюдаемую область с relation to Artifact/Component, а не только пиксельный crop.

### Detected Feature

Модельный кандидат: stitch, edge, marker, label text, discontinuity, count. Не считается фактом до Observation policy.

### Observation

Атомарное утверждение о том, что видно, с location, method, model/version, quality, alternatives и limitations.

### Interpretation Hypothesis

Возможное предметное объяснение observations: twisted stitch, dropped stitch, tension variation, planned shaping. Может быть несколько конкурирующих.

### Observation Set

Согласованная группа observations из нескольких assets/ракурсов/временных точек.

## 3. Типы задач

### Capture Guidance

Определить, какой кадр нужен. Это самостоятельная ценность: корректный отказ и инструкция по съёмке часто важнее слабого анализа.

### Recognition

Материал, инструмент, маркировка, orientation, component, stitch-family. Recognition всегда указывает scope и alternatives.

### Counting and Measurement

Stitches, rows, repeats, dimensions при наличии масштаба. Результат должен включать measurable uncertainty и способ ручной проверки.

### Structural Observation

Edges, joins, topology cues, local anomalies. Не реконструирует невидимую сторону как факт.

### Temporal Motion Analysis

Video для способа движения, hand/tool relation и последовательности. Motion observation не доказывает усвоение Skill без результата.

### Change Detection

Сравнение checkpoints во времени при контролируемой ориентации и масштабе.

### Reference Comparison

Сравнивает заявленные critical features, а не общую «похожесть картинки». Reference не задаёт скрытую конструкцию.

## 4. Многоракурсность

Для сложных выводов требуется Evidence Bundle:

- overview;
- close-up;
- reverse side;
- neutral/tensioned state;
- scale reference;
- before/after;
- relevant Pattern/expected diagram.

Система должна объяснять marginal value каждого дополнительного кадра: какую неопределённость он снимает.

## 5. Связь с Digital Twin

CV не обновляет As-Built Twin напрямую. Последовательность:

1. Asset привязывается к Artifact/Component/Checkpoint.
2. CV создаёт observations.
3. Confidence Engine оценивает claims.
4. Verification Engine сопоставляет criteria.
5. accepted verdict создаёт Execution/Artifact event.
6. As-Built projection перестраивается.

Это защищает Artifact от ошибочного автоматического «видения».

## 6. Ошибка, дефект и вариативность

Визуальная аномалия может быть:

- planned feature;
- material behavior;
- capture artifact;
- acceptable variation;
- process deviation;
- confirmed defect;
- unknown.

CV имеет право заявить только наблюдаемую аномалию. Mistake/Deviation classification принадлежит Verification с контекстом plan/design.

## 7. Confidence

Для каждого visual Claim учитываются:

- достаточность capture;
- согласованность ракурсов;
- применимость модели к craft/technique/material;
- наличие scale/orientation;
- альтернативные интерпретации;
- противоречие measurements/text/history;
- consequence class решения.

Высокая визуальная уверенность в feature не равна высокой уверенности в причине.

## 8. Human-in-the-loop

Эскалация необходима, когда:

- необратимое действие зависит от неоднозначного visual claim;
- supported model domain не покрывает технику;
- evidence противоречиво;
- нужен tactile/physical test;
- пользователь не может получить требуемый ракурс;
- ошибка может уничтожить значительную работу;
- финальная professional certification заявлена отдельно.

Human verdict становится новым Evidence/Decision Record, но не стирает модельные observations.

## 9. Learning loop

Допустимый feedback:

- пользователь подтвердил/опроверг observation;
- последующее физическое действие подтвердило гипотезу;
- expert review создал verdict;
- final outcome показал false positive/negative.

Нельзя автоматически использовать пользовательские фото для обучения без отдельного consent и purpose.

## 10. Failure modes

- texture hallucination на пушистой/тёмной пряже;
- неверный count из-за перспективы;
- путаница front/back и knitting orientation;
- невозможность увидеть floats/inside;
- изменение цвета камерой;
- смешение material irregularity с defect;
- неверная temporal order из одного кадра;
- перенос модели crochet на knitting;
- уверенная реконструкция закрытого участка;
- сравнение с генеративным reference, физически невозможным.

## 11. Domain metrics

Оценивать нужно не только detection accuracy:

- доля requests с корректным capture guidance;
- доля indeterminate verdicts, позже оказавшихся правильным отказом;
- false-safe rate перед irreversible actions;
- время до локализации ошибки;
- saved rework/material;
- agreement с measurements/expert review;
- completion after intervention;
- calibration по consequence classes.

## 12. MVP-подмножество

Ограничить CV небольшим набором observation requests, где ground truth достижим: качество кадра, ориентация, счёт видимых элементов, маркировка материала, сравнение named checkpoint. Не обещать универсальный диагноз по фото.

