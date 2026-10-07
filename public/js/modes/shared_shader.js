export const SHARED_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

export const SHARED_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uBright;
uniform vec2  uMouse;
uniform vec2  uRes;
uniform int   uMode;
uniform sampler2D uCam;
uniform bool  uHasCam;
uniform float uGhost;

#define PI    3.14159265
#define STEPS 50
#define MDIST 18.0
#define SDIST 0.004

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

float sdPrism(vec3 p,float h,float r){
  const vec2 k=vec2(-0.866,0.5);
  p.xy=abs(p.xy);
  p.xy-=2.*min(dot(k,p.xy),0.)*k;
  vec2 d=vec2(length(p.xy-vec2(clamp(p.x,-r*1.732,r*1.732),r))*sign(p.y-r),abs(p.z)-h);
  return min(max(d.x,d.y),0.)+length(max(d,0.));
}
float sdBox(vec3 p,vec3 b){
  vec3 d=abs(p)-b;
  return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.);
}

float scene(vec3 p){
  float breath=1.+sin(uTime*.7)*.028;
  vec3 q=p/breath;
  float ry=uMouse.x*.45+uTime*.06, rx=uMouse.y*.35;
  mat2 mY=mat2(cos(ry),-sin(ry),sin(ry),cos(ry));
  mat2 mX=mat2(cos(rx),-sin(rx),sin(rx),cos(rx));
  q.xz=mY*q.xz; q.yz=mX*q.yz;
  float d;
  if(uMode==1){
    d=sdBox(q,vec3(.5,.5,.15));
    for(int i=0;i<3;i++){
      float a=float(i)*PI*2./3.+uTime*.3;
      d=min(d,sdBox(q-vec3(cos(a)*.8,sin(a*.7)*.4,sin(a)*.8),vec3(.3,.3,.12)));
    }
  } else if(uMode==2){
    d=sdPrism(q,1.1,.65);
    d=-max(-d,-(length(q)-1.7));
  } else {
    d=sdPrism(q,1.1,.65);
  }
  return d*breath;
}

vec3 norm(vec3 p){
  vec2 e=vec2(.002,-.002);
  return normalize(
    e.xyy*scene(p+e.xyy)+e.yyx*scene(p+e.yyx)+
    e.yxy*scene(p+e.yxy)+e.xxx*scene(p+e.xxx));
}

vec3 getCam(vec2 uv,float ab){
  uv.x=1.-uv.x;
  float r=texture2D(uCam,uv+vec2(ab,0.)).r;
  float g=texture2D(uCam,uv).g;
  float b2=texture2D(uCam,uv-vec2(ab,0.)).b;
  return vec3(r,g,b2);
}

void main(){
  vec2 p=(vUv*2.-1.)*vec2(uRes.x/uRes.y,1.);
  vec3 ro=vec3(0.,0.,3.2);
  vec3 rd=normalize(vec3(p,-1.8));
  float t=0.; bool hit=false;
  for(int i=0;i<STEPS;i++){
    float d=scene(ro+rd*t);
    if(d<SDIST){hit=true;break;}
    if(t>MDIST) break;
    t+=d;
  }
  vec3 col=vec3(0.);
  if(hit){
    vec3 pos=ro+rd*t;
    vec3 nor=norm(pos);
    vec3 refDir=refract(rd,nor,.62);
    vec2 camUV=refDir.xy*.5+.5;
    float nv=noise(camUV*4.+uTime*.15)*.04;
    camUV+=vec2(nv,nv*.7);
    vec3 camCol=vec3(0.);
    if(uHasCam){
      camCol=getCam(camUV,t*.008);
      float lum=dot(camCol,vec3(.299,.587,.114));
      camCol=mix(vec3(lum),camCol,.55);
    }
    float ang=dot(nor,-rd);
    vec3 rainbow;
    rainbow.r=.5+.5*sin(ang*6.+uTime*.4);
    rainbow.g=.5+.5*sin(ang*6.+uTime*.4+2.09);
    rainbow.b=.5+.5*sin(ang*6.+uTime*.4+4.19);
    float fr=pow(1.-abs(dot(nor,-rd)),3.5);
    float cm=uMode==1?.45:uMode==2?.15:.30;
    float rm=uMode==1?.25:uMode==2?.12:.40;
    col=vec3(.06,.07,.11);
    col=mix(col,camCol,cm*uBright);
    col=mix(col,rainbow,rm);
    col+=mix(vec3(.3,.7,1.),vec3(.6,.3,1.),fr)*fr*(.5+uBright*.6);
    float spec=pow(max(dot(reflect(-normalize(vec3(1.5,2.,2.5)),nor),-rd),0.),64.);
    col+=vec3(.9,.95,1.)*spec*.6;
    col*=(.3+uBright*.8);
  } else {
    if(uHasCam){
      vec3 bg=getCam(vUv,0.);
      float lum=dot(bg,vec3(.299,.587,.114));
      col=vec3(lum*.1);
    }
    float st=pow(noise(vUv*180.+uTime*.003),14.)*.7;
    col+=vec3(st*.7,st*.85,st);
  }
  if(uHasCam&&uGhost>.0){
    vec3 gh=getCam(vUv+vec2(.006,0.),0.);
    float gl=dot(gh,vec3(.299,.587,.114));
    col+=vec3(gl*.04,gl*.06,gl*.08)*uGhost;
  }
  col*=1.-dot(vUv-.5,vUv-.5)*1.4;
  gl_FragColor=vec4(col,1.);
}`;

export function createSharedPrismState(gl) {
  const prog = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);

  gl.shaderSource(vs, SHARED_VERT);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn('Shared prism vertex shader:', gl.getShaderInfoLog(vs));
  }

  gl.shaderSource(fs, SHARED_FRAG);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('Shared prism fragment shader:', gl.getShaderInfoLog(fs));
  }

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('Shared prism program link:', gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const qBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPL = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPL);
  gl.vertexAttribPointer(aPL, 2, gl.FLOAT, false, 0, 0);

  const U = {
    time: gl.getUniformLocation(prog, 'uTime'),
    bright: gl.getUniformLocation(prog, 'uBright'),
    mouse: gl.getUniformLocation(prog, 'uMouse'),
    res: gl.getUniformLocation(prog, 'uRes'),
    mode: gl.getUniformLocation(prog, 'uMode'),
    cam: gl.getUniformLocation(prog, 'uCam'),
    hasCam: gl.getUniformLocation(prog, 'uHasCam'),
    ghost: gl.getUniformLocation(prog, 'uGhost'),
  };

  const camTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, camTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));

  return { prog, qBuf, aPL, U, camTex };
}
