---
title: Vibe coding sin perder el control
excerpt: Dejar que el modelo escriba rápido no significa dejar de entender lo que escribió.
year: 2026
readingTime: 6 min
order: 1
---

El vibe coding tiene mala fama porque se confunde con no leer el código. A mí me funciona al revés: el modelo me da velocidad de borrador y yo me reservo la revisión, que es donde de verdad se decide la calidad de lo que sale.

Mi regla es simple y no la negocio: si no puedo explicar en una frase qué hace un bloque, no entra al repositorio. No importa que funcione, no importa que los tests pasen. Si no lo entiendo, mañana no lo voy a poder arreglar.

De ahí salen tres costumbres. La primera es pedir cambios pequeños, del tamaño de un commit. La segunda es leer siempre el diff, nunca el archivo completo. La tercera es escribir yo mismo la parte que define el dominio: los nombres, los límites, el modelo de datos.

Con eso, el modelo se parece menos a un piloto automático y más a un colega muy rápido que nunca se cansa de reescribir. Es un buen trato.
