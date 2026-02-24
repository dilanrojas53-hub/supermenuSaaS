# Smart Menu Platform - Ideas de Diseño

## Contexto
Menú interactivo SaaS Multi-Tenant para restaurantes en Costa Rica. Mobile-first, theming dinámico por tenant, enfocado en maximizar ticket promedio con neuro-ventas.

---

<response>
<idea>

## Idea 1: "Gastro Editorial" — Diseño Magazine de Alta Cocina

**Design Movement**: Editorial Design / Magazine Layout aplicado a interfaces digitales, inspirado en publicaciones gastronómicas como Bon Appétit y Kinfolk.

**Core Principles**:
1. Tipografía como protagonista — los nombres de platillos son titulares editoriales
2. Espacio negativo generoso — cada platillo respira como una página de revista
3. Fotografía hero con overlays sutiles — las imágenes dominan la composición
4. Jerarquía visual dramática — contraste extremo entre tamaños tipográficos

**Color Philosophy**: Paleta neutra base (cremas, blancos cálidos, negros suaves) que se "tiñe" con el color primario del tenant como acento editorial. El color del restaurante aparece en detalles: líneas divisorias, badges, precios destacados. No satura, sino que puntúa.

**Layout Paradigm**: Scroll vertical continuo con secciones full-width. Cards de platillos en formato editorial asimétrico: imagen grande a la izquierda, texto a la derecha en desktop; stack vertical en mobile con imagen hero arriba. Categorías como "capítulos" de una revista.

**Signature Elements**:
1. Líneas tipográficas finas que separan secciones (como reglas editoriales)
2. Números de precio en tipografía display condensada, alineados a la derecha
3. Badges como sellos editoriales con bordes finos y tipografía uppercase

**Interaction Philosophy**: Transiciones page-turn suaves. Los elementos aparecen con fade-in secuencial como si se estuviera hojeando una publicación. Hover states revelan información adicional con elegancia.

**Animation**: Entrada staggered de elementos al scroll (cada card aparece 100ms después de la anterior). Parallax sutil en imágenes hero. Badges que pulsan suavemente para atraer atención sin ser agresivos.

**Typography System**: Display font serif (Playfair Display) para nombres de platillos y headers. Body font sans-serif (DM Sans) para descripciones. Precios en font monospace condensada. Contraste de tamaños: 28px nombres vs 14px descripciones.

</idea>
<probability>0.07</probability>
<text>Enfoque editorial de alta cocina con tipografía dramática y layout de revista gastronómica</text>
</response>

<response>
<idea>

## Idea 2: "Neon Street Food" — Diseño Urbano Nocturno

**Design Movement**: Neo-Brutalism mezclado con estética de street food asiático y letreros de neón. Inspirado en la energía visual de mercados nocturnos y food trucks.

**Core Principles**:
1. Contraste máximo — fondos oscuros con acentos vibrantes que "brillan"
2. Bordes gruesos y sombras duras — elementos que se sienten tangibles y bold
3. Iconografía custom — emojis y pictogramas como lenguaje universal de comida
4. Micro-interacciones lúdicas — la interfaz tiene personalidad y humor

**Color Philosophy**: Base oscura (near-black con tinte del color secundario del tenant). El color primario del tenant se usa como "neón" — aparece en bordes, highlights, y elementos interactivos con efecto glow sutil (box-shadow con color). El accent color para CTAs y badges de urgencia.

**Layout Paradigm**: Grid compacto tipo "menú de pared" con cards apiladas. En mobile, cards horizontales tipo ticket/receipt con borde izquierdo de color. Categorías como tabs horizontales scrolleables con indicador animado. Footer sticky con carrito.

**Signature Elements**:
1. Efecto "glow" en bordes y elementos interactivos usando box-shadow con el color del tenant
2. Cards con esquinas cortadas (clip-path) en una esquina, estilo ticket
3. Badges con fondo sólido vibrante y texto en mayúsculas bold

**Interaction Philosophy**: Feedback táctil inmediato. Al tocar "agregar", el botón hace un bounce y el counter del carrito hace un pop. Todo se siente responsive y con peso. Swipe horizontal para categorías.

**Animation**: Spring animations para botones (bounce on tap). Counter del carrito con número que hace flip animation. Cards que hacen slide-in desde abajo al cargar. Glow pulse en el badge "Platillo de la Semana".

**Typography System**: Display font bold geométrica (Space Grotesk) para headers y precios. Body font humanista (Outfit) para descripciones. Todo en mayúsculas para categorías y badges. Precios grandes y bold como protagonistas.

</idea>
<probability>0.05</probability>
<text>Estética urbana nocturna con efectos neón, bordes bold y personalidad de street food</text>
</response>

<response>
<idea>

## Idea 3: "Warm Craft" — Diseño Artesanal Cálido

**Design Movement**: Organic Design / Craft Aesthetic. Inspirado en menús de pizarra de cafeterías artesanales, mercados orgánicos y la calidez de la cocina costarricense.

**Core Principles**:
1. Texturas naturales — fondos con grano sutil, bordes orgánicos, sensación táctil
2. Calidez cromática — tonos tierra, cremas y el color del tenant como especia
3. Jerarquía amable — nada grita, todo invita; la interfaz se siente como una conversación
4. Detalles artesanales — pequeños ornamentos que dan sensación de hecho a mano

**Color Philosophy**: Base cálida (crema/beige con variación según tenant). El color primario del tenant se aplica como "tinta" — headers, iconos, bordes de cards. Siempre sobre fondos cálidos para mantener la sensación orgánica. Sombras en tonos sepia, nunca grises puros.

**Layout Paradigm**: Single column en mobile con cards generosas y bien espaciadas. Categorías como secciones con dividers decorativos (líneas onduladas o ilustraciones simples). Hero section con el "Platillo de la Semana" como una pizarra destacada. Grid de 2 columnas en tablet+.

**Signature Elements**:
1. Dividers entre secciones con formas orgánicas SVG (ondas suaves, no líneas rectas)
2. Cards con sombra cálida (sepia-tinted) y border-radius generoso
3. Precio dentro de un "sello" circular con el color del tenant

**Interaction Philosophy**: Suave y deliberada. Transiciones lentas y orgánicas. Al agregar al carrito, el item "flota" hacia el botón del carrito. Todo se siente pausado y placentero, como la experiencia de comer bien.

**Animation**: Fade-in con scale sutil (0.95 → 1.0) para cards al entrar en viewport. Ondulación suave en dividers SVG. Badge "Platillo de la Semana" con animación de brillo que recorre el borde. Carrito flotante con bounce suave al recibir items.

**Typography System**: Display font serif redondeada (Lora o Merriweather) para nombres de platillos. Body font sans-serif amigable (Nunito) para descripciones. Precios en la misma serif pero bold. Categorías en small-caps.

</idea>
<probability>0.06</probability>
<text>Estética artesanal cálida con texturas orgánicas y la calidez de la cocina costarricense</text>
</response>
