---
title: Lo que aprendí dejando que un modelo escriba mis tests
excerpt: Escribió más casos que yo, y casi todos los importantes se le olvidaron.
year: 2026
readingTime: 5 min
order: 2
---

Le pasé un módulo pequeño y le pedí cobertura. Me devolvió treinta tests en un minuto: verdes, prolijos y curiosamente ciegos a los dos casos que en producción me habían roto la semana anterior.

Tenía sentido. El modelo mira el código que existe y comprueba que hace lo que parece hacer. Los errores de verdad viven en lo que el código no contempla: el usuario sin permisos, la respuesta a medias, el reintento que llega dos veces.

La conclusión no fue «no sirve», fue «sirve para otra cosa». Ahora yo escribo la lista de lo que puede salir mal y el modelo la convierte en tests. Describir el desastre sigue siendo trabajo humano; teclearlo, ya no.
