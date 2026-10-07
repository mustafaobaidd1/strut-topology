<script lang="ts">
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import { onMount } from 'svelte';
  import { app } from '../state/app.svelte';
  import Icon from './Icon.svelte';

  let dialog: HTMLDialogElement | undefined = $state();

  /** Renders TeX into the element (KaTeX, HTML + MathML output). */
  function tex(node: HTMLElement, src: string) {
    const display = node.tagName !== 'SPAN';
    katex.render(src, node, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
    return {
      update(next: string) {
        katex.render(next, node, {
          displayMode: display,
          throwOnError: false,
          output: 'htmlAndMathml',
        });
      },
    };
  }

  onMount(() => {
    dialog?.showModal();
  });

  function close() {
    dialog?.close();
  }

  function runReference() {
    close();
    app.enterReference(2);
  }
</script>

<dialog
  bind:this={dialog}
  class="how"
  aria-labelledby="how-title"
  onclose={() => (app.howOpen = false)}
  data-testid="how-it-works"
>
  <header class="bar">
    <h2 id="how-title">How it works</h2>
    <button type="button" class="close" onclick={close} aria-label="Close">
      <Icon name="close" size={18} />
    </button>
  </header>
  <div class="body">
    <p class="kind">
      <strong
        >An educational design tool implementing a published method, not a certified engineering
        calculator.</strong
      > The finite-element model and the optimiser are verified against closed-form results and against
      the published values of the 88-line code (below), but real parts need stress, buckling, fatigue
      and manufacturing checks that this tool does not do.
    </p>

    <h3>The question</h3>
    <p>
      Given where a part is held and where it is pushed, which layout of a fixed amount of material
      is stiffest? Stiffness is measured by the <em>compliance</em> — the work the loads do on the displacements
      — so the problem is to minimise compliance under a volume budget:
    </p>
    <div
      use:tex={String.raw`\begin{aligned}\min_{\mathbf x}\;& c = \mathbf F^{\mathsf T}\mathbf u = \sum_e E_e(\bar x_e)\,\mathbf u_e^{\mathsf T}\mathbf k_0\,\mathbf u_e\\
      \text{subject to}\;& \mathbf K(\bar{\mathbf x})\,\mathbf u = \mathbf F,\qquad \tfrac{1}{N}\textstyle\sum_e \bar x_e \le f,\qquad 0\le x_e\le 1\end{aligned}`}
    ></div>

    <h3>Elasticity and Q4 elements</h3>
    <p>
      The domain is a thin plate in plane stress, linear elastic and isotropic with
      <span use:tex={'\\nu = 0.3'}></span>. It is meshed with square bilinear (Q4) elements of unit
      size; each node carries two displacements. The element stiffness for unit modulus is the
      closed form used by Andreassen et al. (2011), equal to 2 × 2 Gauss integration of
    </p>
    <div
      use:tex={String.raw`\mathbf k_0 = \int_{\Omega_e} \mathbf B^{\mathsf T}\mathbf D\,\mathbf B\,\mathrm dA,\qquad
      \mathbf D = \frac{E}{1-\nu^2}\begin{bmatrix}1&\nu&0\\ \nu&1&0\\ 0&0&\tfrac{1-\nu}{2}\end{bmatrix}`}
    ></div>

    <h3>SIMP: grey material is made inefficient</h3>
    <p>
      Each element has a density between 0 and 1. Its stiffness follows the modified SIMP law, with
      a tiny floor so empty regions keep the system solvable:
    </p>
    <div
      use:tex={String.raw`E_e = E_{\min} + \bar x_e^{\,p}\,(E_0 - E_{\min}),\qquad E_0 = 1,\; E_{\min} = 10^{-9}`}
    ></div>
    <p>
      With <span use:tex={'p = 3'}></span>, half-dense material gives an eighth of the stiffness for
      half the volume, so the optimiser prefers solid or void.
    </p>

    <h3>Compliance sensitivity</h3>
    <p>Compliance is self-adjoint, so its gradient needs no extra solve:</p>
    <div
      use:tex={String.raw`\frac{\partial c}{\partial \bar x_e} = -p\,\bar x_e^{\,p-1}(E_0 - E_{\min})\;\mathbf u_e^{\mathsf T}\mathbf k_0\,\mathbf u_e`}
    ></div>

    <h3>Filtering sets the minimum member size</h3>
    <p>
      Unfiltered, the problem has no length scale and grows checkerboards. The density filter of
      Bruns &amp; Tortorelli (2001) averages the design variables over a cone of radius
      <span use:tex={'r_{\\min}'}></span>:
    </p>
    <div
      use:tex={String.raw`\tilde x_e = \frac{\sum_i H_{ei}\,x_i}{\sum_i H_{ei}},\qquad H_{ei} = \max\bigl(0,\; r_{\min} - \Delta(e,i)\bigr)`}
    ></div>

    <h3>Heaviside projection with β continuation</h3>
    <p>
      Filtered fields have grey borders. The smoothed Heaviside projection of Wang, Lazarov &amp;
      Sigmund (2011) pushes them to black and white:
    </p>
    <div
      use:tex={String.raw`\bar x_e = \frac{\tanh(\beta\eta) + \tanh\bigl(\beta(\tilde x_e - \eta)\bigr)}{\tanh(\beta\eta) + \tanh\bigl(\beta(1-\eta)\bigr)},\qquad \eta = 0.5`}
    ></div>
    <p>
      Starting sharp would freeze the topology, so <span use:tex={'\\beta'}></span> starts at 1 and doubles
      every 25 iterations (or as soon as the design settles) up to its final value. After an edit it drops
      back to at most 2 so the design can still change shape. Gradients flow back through the projection
      and the filter by the chain rule:
    </p>
    <div
      use:tex={String.raw`\frac{\partial c}{\partial x_j} = \sum_e \frac{\partial c}{\partial \bar x_e}\,\frac{\partial \bar x_e}{\partial \tilde x_e}\,\frac{H_{je}}{\sum_i H_{ei}}`}
    ></div>

    <h3>Optimality-criteria update</h3>
    <p>
      Each iteration moves every design variable by at most <span use:tex={'m = 0.2'}></span>
      (shrunk to <span use:tex={String.raw`0.2\cdot 4/\beta`}></span> once the projection is sharper
      than <span use:tex={String.raw`\beta = 4`}></span>, where boundary elements would otherwise
      flip back and forth):
    </p>
    <div
      use:tex={String.raw`x_e^{\text{new}} = \operatorname{clamp}\Bigl(x_e\sqrt{B_e},\; \max(0, x_e - m),\; \min(1, x_e + m)\Bigr),\qquad B_e = \frac{-\partial c/\partial x_e}{\lambda\,\partial V/\partial x_e}`}
    ></div>
    <p>
      The Lagrange multiplier <span use:tex={'\\lambda'}></span> is found so the volume is met
      exactly: by bisection in the reference mode (as in the paper), by a bracketed regula falsi
      (Illinois) on <span use:tex={'\\log\\lambda'}></span>, warm-started from the last value, in
      interactive mode. A run stops when no design variable moves by more than 0.01, or when the
      compliance has changed by less than 0.01 % over 10 iterations, once
      <span use:tex={'\\beta'}></span> has reached its final value.
    </p>

    <h3>Solver</h3>
    <p>
      The equilibrium <span use:tex={'\\mathbf K\\mathbf u = \\mathbf F'}></span> is solved in a Web
      Worker by conjugate gradients with a matrix-free, element-by-element product, warm-started
      from the previous displacement. The preconditioner is one geometric multigrid V-cycle:
      Galerkin coarse operators
      <span use:tex={'\\mathbf P^{\\mathsf T}\\mathbf K\\mathbf P'}></span> with bilinear interpolation
      (which keeps the 10⁹ stiffness contrast between solid and void), symmetric point-block Gauss–Seidel
      smoothing and a banded Cholesky solve on the coarsest grid. It converges in roughly 10–30 iterations
      to a relative residual of 10⁻⁶ whatever the mesh. The reference mode uses a direct banded Cholesky
      factorisation instead, like MATLAB's backslash.
    </p>

    <h3>Units</h3>
    <p>
      Everything is dimensionless: <span use:tex={'E_0 = 1'}></span>,
      <span use:tex={'\\nu = 0.3'}></span>, unit thickness, unit element size, and loads of
      magnitude about 1 (the reference load is <span use:tex={'F = 1'}></span>). Compliance
      therefore has units of F²/(E₀ t) and scales with the square of the loads; stresses are in F
      per element width. Line loads are spread as consistent nodal forces over a two-element solid
      deck that moves with them.
    </p>

    <h3>Validation</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Check</th><th>Reference</th><th>Result</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Patch test: uniform strain on a 8 × 4 mesh, all three solvers</td>
            <td>exact linear field</td>
            <td>error below 10⁻¹³</td>
          </tr>
          <tr>
            <td>Cantilever, L/H = 8, clamped root, parabolic end shear</td>
            <td>Timoshenko beam theory, κ = 5/6: δ = 2072.96</td>
            <td>2, 4, 8, 16, 32 elements deep: −11.3 %, −3.32 %, −1.04 %, −0.44 %, −0.28 %</td>
          </tr>
          <tr>
            <td>Same beam, root displacements from the elasticity solution</td>
            <td>Timoshenko &amp; Goodier plane-stress solution</td>
            <td>max displacement error 2.9 %, 0.75 %, 0.19 %, 0.048 % (4–32 deep): second order</td>
          </tr>
          <tr>
            <td>Compliance gradient (density filter, projection, passive elements)</td>
            <td>central finite differences</td>
            <td>relative error about 10⁻⁸ (test bound 10⁻⁵)</td>
          </tr>
          <tr>
            <td>Symmetric bridge solved without imposing symmetry</td>
            <td>mirror symmetry</td>
            <td>asymmetry below 10⁻⁸ (direct solver)</td>
          </tr>
          <tr>
            <td>88-line code, MBB 60 × 20, ft = 1, r<sub>min</sub> 2.4</td>
            <td>c = 216.81 (Andreassen et al. 2011)</td>
            <td>216.81 after 106 iterations</td>
          </tr>
          <tr>
            <td>Same, density filter ft = 2</td>
            <td>c = 233.71</td>
            <td>233.71 after 144 iterations (MGCG gives the same)</td>
          </tr>
          <tr>
            <td>Same, Heaviside variant ft = 3, r<sub>min</sub> 1.8</td>
            <td>c = 189.14</td>
            <td>189.14 after 409 iterations</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The clamped cantilever settles about 0.24 % stiffer than beam theory because a fully clamped
      edge also stops the Poisson contraction at the wall; with exact boundary data the error falls
      at second order as expected for Q4 elements.
    </p>
    <button type="button" class="ref-btn" onclick={runReference}
      >Run the 88-line reference yourself</button
    >

    <h3>Limitations</h3>
    <ul>
      <li>Linear elasticity and small displacements only; plane stress in a uniform plate.</li>
      <li>
        Compliance (stiffness) is the only objective: no stress, buckling, fatigue or displacement
        constraints, and a single load case (all loads act together).
      </li>
      <li>
        The optimiser finds a local optimum; results depend on the filter radius, the penalty and
        the continuation, as with any density method.
      </li>
      <li>
        Stresses shown are those of the SIMP model at element centres; intermediate densities have
        no physical stress, and point loads create singular peaks (the colour scale is capped).
      </li>
      <li>
        Manufacturing realism is limited to a minimum member size from the filter: no overhang,
        tool-access or drilling rules. Exported outlines are a starting point for CAD, not a part.
      </li>
      <li>Meshes are square elements on a rectangle; very fine meshes can be slow on phones.</li>
    </ul>

    <h3>References</h3>
    <ul class="refs">
      <li>
        Andreassen, Clausen, Schevenels, Lazarov &amp; Sigmund (2011). Efficient topology
        optimization in MATLAB using 88 lines of code. <em>Struct Multidisc Optim</em> 43:1–16.
      </li>
      <li>
        Bendsøe &amp; Sigmund (2003). <em
          >Topology Optimization: Theory, Methods and Applications.</em
        >
        Springer.
      </li>
      <li>
        Bruns &amp; Tortorelli (2001). Topology optimization of non-linear elastic structures and
        compliant mechanisms. <em>Comput Methods Appl Mech Eng</em> 190:3443–3459.
      </li>
      <li>
        Wang, Lazarov &amp; Sigmund (2011). On projection methods, convergence and robust
        formulations in topology optimization. <em>Struct Multidisc Optim</em> 43:767–784.
      </li>
      <li>
        Amir, Aage &amp; Lazarov (2014). On multigrid-CG for efficient topology optimization.
        <em>Struct Multidisc Optim</em> 49:815–829.
      </li>
      <li>
        Sigmund (2007). Morphology-based black and white filters for topology optimization.
        <em>Struct Multidisc Optim</em> 33:401–424 (the grey-level measure).
      </li>
      <li>
        Timoshenko &amp; Goodier (1951). <em>Theory of Elasticity</em>, 2nd ed., McGraw-Hill
        (end-loaded cantilever).
      </li>
    </ul>
  </div>
</dialog>

<style>
  .how {
    width: min(760px, 100vw);
    height: 100vh;
    max-height: 100vh;
    margin: 0 0 0 auto;
    padding: 0;
    border: none;
    border-left: 1px solid var(--hair-strong);
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-2);
  }
  .how::backdrop {
    background: rgba(21, 21, 21, 0.35);
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 10px 24px;
    background: var(--paper);
    border-bottom: 1px solid var(--hair-strong);
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-stretch: 115%;
    letter-spacing: 0.04em;
    font-weight: 750;
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--hair);
    border-radius: var(--r-sm);
    background: var(--paper-raised);
  }
  .body {
    padding: 8px 24px 40px;
    max-width: 70ch;
  }
  h3 {
    margin: 26px 0 6px;
    font-size: 16px;
    font-weight: 750;
    font-stretch: 95%;
  }
  p,
  li {
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
  }
  .kind {
    margin-top: 16px;
    padding: 12px 14px;
    border-left: 3px solid var(--load);
    background: var(--paper-raised);
  }
  .kind strong {
    color: var(--ink);
  }
  .body :global(.katex-display) {
    margin: 10px 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 0;
  }
  .body :global(.katex) {
    font-size: 1.05em;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 7px 8px;
    border-bottom: 1px solid var(--hair);
  }
  th {
    font-weight: 700;
    font-stretch: 90%;
    color: var(--ink);
  }
  td {
    color: var(--ink-2);
  }
  .ref-btn {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--ink);
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--paper);
    font-weight: 700;
  }
  .refs li {
    font-size: 13.5px;
  }
</style>
