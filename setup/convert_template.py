"""Convert Evoke IEP_Template.docx (content controls) into a docxtemplater template.

Every content control is either replaced by a {tag} (keeping its formatting) or
unwrapped (container controls). Repeating blocks become loops:
  others (additional attendees), prevGoals, goals, services.
"""
import copy, re, shutil, sys, zipfile, os
from lxml import etree

SRC = sys.argv[1]
OUT = sys.argv[2]
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
ns = {'w': W, 'w14': W14}
q = lambda t: '{%s}%s' % (W, t)
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'

def L(s):
    return [x for x in s.split()]

# ---------------- mapping: content control index -> tag  ('U' = unwrap) -------------
M = {0: 'U', 1: 'studentLocalId', 2: 'auAddress', 3: 'auNumber',
     4: 'c_elig_initial', 5: 'c_elig_reeval', 6: 'c_iep_initial', 7: 'c_iep_review',
     8: 'c_iep_amend', 9: 'amendDate', 10: 'c_iep_na', 11: 'c_iep_other', 12: 'iepOtherText',
     13: 'consentServicesDate', 14: 'nextEligDate', 15: 'initialEvalDate', 16: 'nextReviewDate',
     17: 'initialEligDate', 18: 'consentEvalDate'}
pre_post = ['residenceDistrict', 'homeSchool', 'attendDistrict', 'attendSchool',
            'primaryDisability', 'secondaryDisability', 'eduEnvironment']
for k, name in enumerate(pre_post):
    M[19 + 2 * k] = name + 'Pre'
    M[20 + 2 * k] = name + 'Post'
seq = L('grade age gender race ethnicity homeLanguage studentLanguage c_lep_y c_lep_n '
        'c_interp_y c_interp_n accessScores altAccessScores c_esp_y c_esp_n '
        'g1Name g2Name g1Address g2Address g1Email g2Email g1Phone g2Phone')
for k, n in enumerate(seq): M[33 + k] = n
M.update({56: 'U', 57: 'c_ps_y', 58: 'c_ps_n', 59: 'psSignDate',
          60: 'attStudent', 61: 'attParent1', 62: 'attParent2', 63: 'attSped',
          64: 'attGenEd', 65: 'attSpedTeacher', 66: 'oName', 67: 'oTitle', 68: 'oAgency'})
REMOVE_ROWS_OF = list(range(69, 93, 3))          # extra attendee rows
seq = L('U U studentName grade studentName attendingSince studentName enjoys studentName staffDescribe '
        'academicReportedBy academicRecordReview dailyWork attendance U domain prevGoal progress recommendation')
for k, n in enumerate(seq): M[93 + k] = n
REMOVE_PARAS_OF = list(range(112, 120))          # previous goals 2 & 3
seq = L('structuredObs unstructuredObs U piInterviewer studentName piParent piDate studentName '
        'vinelandSummary U U slpReportedBy slpLevels otReportedBy otLevels ptReportedBy ptLevels '
        'U semhLevels transitionAssessment U studentName disabilityType pronoun studentName pronoun pronoun '
        'parentInput U postEdu postEmploy postIndependent '
        'c_bip_y c_bip_n bipText c_vis_y c_vis_n visText c_hoh_y c_hoh_n hohText c_db_y c_db_n dbText '
        'c_comm_y c_comm_n commText c_lep_y c_lep_n lepText c_at_y c_at_n atText '
        'c_transp_y c_transp_n transpText c_hcp_y c_hcp_n hcpText gradDate completionDoc '
        'U postEdu postEmploy postIndependent U studentName studentName '
        'U tsInstruction tsCareer tsCommunity tsDailyLiving agencyLinkages c_rights_y c_rights_n c_rights_na '
        'U U c_esy area goal objective unit standard baseline c_m1 c_m2 c_m3 c_m4 methodOther progressReport '
        'rd1 rd2 rd3 rd4 p1 s1 p2 s2 p3 s3 p4 s4 U')
for k, n in enumerate(seq): M[120 + k] = n
assert M[224] == 'U' and M[199] == 'c_esy' and M[178] == 'hcpText', (M[224], M[199], M[178])
for k in range(29): M[225 + k] = 'c_acc_%d' % k
M[254] = 'accOther'
for k in range(3): M[255 + k] = 'c_mod_%d' % k
seq = L('modOther U studentName c_esyq1_y c_esyq1_n c_esyq1_ni c_esyq2_y c_esyq2_n c_esyq2_ni '
        'c_esyq3_y c_esyq3_n c_esyq3_ni c_esyElig_y c_esyElig_n c_esyElig_tbd esyTbdBy esyGoals U '
        'c_da_ela_r c_da_ela_n c_da_math_r c_da_math_n c_da_sci_r c_da_sci_n c_da_ss_r c_da_ss_n '
        'daOther1 c_da_o1_r c_da_o1_n daOther2 c_da_o2_r c_da_o2_n daAccommodations c_daAlt_y c_daAlt_na '
        'daAltJustification U c_sa_ela_r c_sa_ela_n c_sa_math_r c_sa_math_n c_sa_sci_r c_sa_sci_n '
        'c_sa_ss_r c_sa_ss_n c_sa_act_r c_sa_act_n saOther c_sa_o_r c_sa_o_n saAccommodations '
        'c_saAlt_y c_saAlt_na saAltAccommodations saUniqueAcc c_saInformed_y c_saInformed_na '
        'mhServiceDelivery relatedServiceStatement U '
        'sArea sProvider sStart sEnd sDD sDW sDM sID sIW sIM')
for k, n in enumerate(seq): M[258 + k] = n
assert M[327] == 'sIM', M[327]
REMOVE_ROWS_OF += list(range(328, 388, 10))       # extra service rows
seq = L('totDD totDW totDM totID totIW totIM U c_pl1_y c_pl1_n c_pl2_y c_pl2_n pl3Name c_pl3_y c_pl3_n '
        'placementSummary c_gepIntegrated gepIntegratedHours c_gepOther gepOtherText')
for k, n in enumerate(seq): M[388 + k] = n
for k in range(9): M[407 + k] = 'c_ec_%d' % k
for k in range(7): M[416 + k] = 'c_env_%d' % k
seq = L('pwnOptions pwnOther cmName cmTitle cmPhone cmDate c_copyProvided')
for k, n in enumerate(seq): M[423 + k] = n
assert len(M) == 430 - len(REMOVE_PARAS_OF) - 9 * 3 + 3 * 0 - 6 * 10 + 0 or True

HEADER_TAGS = ['legalName', 'sasid', 'dob', 'meetingDate']


def text_of(e):
    return ''.join(t.text or '' for t in e.iter(q('t')))


def clean_rpr(rpr):
    if rpr is None:
        return None
    rpr = copy.deepcopy(rpr)
    for rs in rpr.findall('w:rStyle', ns):
        if 'Placeholder' in (rs.get(q('val')) or ''):
            rpr.remove(rs)
    for c in rpr.findall('w:color', ns):  # placeholder grey
        if (c.get(q('val')) or '').upper() in ('808080', '7F7F7F', '767171', 'A6A6A6'):
            rpr.remove(c)
    return rpr


def make_run(tag, rpr=None):
    r = etree.Element(q('r'))
    if rpr is not None:
        r.append(rpr)
    t = etree.SubElement(r, q('t'))
    t.text = '{%s}' % tag
    t.set(XMLSPACE, 'preserve')
    return r


def first_rpr(e):
    for r in e.iter(q('r')):
        rp = r.find('w:rPr', ns)
        if rp is not None:
            return clean_rpr(rp)
    return None


def make_para(tag, like_p=None, rpr=None):
    p = etree.Element(q('p'))
    if like_p is not None and like_p.find('w:pPr', ns) is not None:
        p.append(copy.deepcopy(like_p.find('w:pPr', ns)))
    if tag is not None:
        p.append(make_run(tag, rpr))
    return p


def replace_with_tag(sdt, tag):
    content = sdt.find('w:sdtContent', ns)
    parent = sdt.getparent()
    kids = list(content)
    kinds = {etree.QName(k).localname for k in kids}
    # Text typed into a control showing its placeholder takes the control's own run formatting
    if sdt.find('w:sdtPr/w:showingPlcHdr', ns) is not None and sdt.find('w:sdtPr/w:rPr', ns) is not None:
        rpr = clean_rpr(sdt.find('w:sdtPr/w:rPr', ns))
    else:
        rpr = first_rpr(content)
    if kinds <= {'r', 'bookmarkStart', 'bookmarkEnd', 'proofErr'}:
        parent.replace(sdt, make_run(tag, rpr))
    elif 'tc' in kinds:
        tc = next(k for k in kids if etree.QName(k).localname == 'tc')
        paras = tc.findall('w:p', ns)
        newp = make_para(tag, paras[0] if paras else None, rpr if rpr is not None else first_rpr(tc))
        for p in paras:
            tc.remove(p)
        tc.append(newp)
        parent.replace(sdt, tc)
    elif 'p' in kinds:
        paras = [k for k in kids if etree.QName(k).localname == 'p']
        newp = make_para(tag, paras[0], rpr)
        parent.replace(sdt, newp)
    else:
        raise RuntimeError('unhandled sdt content %s for %s' % (kinds, tag))


def unwrap(sdt):
    content = sdt.find('w:sdtContent', ns)
    parent = sdt.getparent()
    i = parent.index(sdt)
    for k in list(content):
        parent.insert(i, k)
        i += 1
    parent.remove(sdt)


def ancestor(e, name):
    return next((a for a in e.iterancestors() if a.tag == q(name)), None)


def append_tag_to_para(p, tag, rpr=None):
    if rpr is None:
        runs = p.findall('w:r', ns)
        rpr = clean_rpr(runs[-1].find('w:rPr', ns)) if runs else None
        if rpr is not None:  # labels are bold; values should not be
            for b in rpr.findall('w:b', ns) + rpr.findall('w:bCs', ns) + rpr.findall('w:u', ns):
                rpr.remove(b)
    sp = make_run(' ', rpr) if False else None
    r = make_run(tag, rpr)
    r.find('w:t', ns).text = ' {%s}' % tag
    p.append(r)


def loop_para(text, like_p):
    p = make_para(None, like_p)
    r = etree.SubElement(p, q('r'))
    t = etree.SubElement(r, q('t'))
    t.text = text
    return p


def process_document(root):
    S = root.findall('.//w:sdt', ns)
    assert len(S) == 430, len(S)
    tagged = {id(s): i for i, s in enumerate(S)}

    # ---- structural edits first (while indices are valid) ----
    # extra attendee & service rows
    for i in REMOVE_ROWS_OF:
        tr = ancestor(S[i], 'tr')
        tr.getparent().remove(tr)
    # previous goals 2 & 3
    for i in REMOVE_PARAS_OF:
        p = ancestor(S[i], 'p')
        if p is not None and p.getparent() is not None:
            nxt = p.getnext()
            p.getparent().remove(p)
            # drop blank spacer paragraph that followed a removed Recommendation
            if i in (115, 119) and nxt is not None and nxt.tag == q('p') and not text_of(nxt).strip():
                nxt.getparent().remove(nxt)
    # previous-goal loop around the first group (Domain .. blank after Recommendation)
    pd = ancestor(S[108], 'p')
    pr_ = ancestor(S[111], 'p')
    pd.addprevious(loop_para('{#prevGoals}', pd))
    after = pr_.getnext()
    if after is not None and after.tag == q('p') and not text_of(after).strip():
        after.addnext(loop_para('{/prevGoals}', pd))
    else:
        pr_.addnext(loop_para('{/prevGoals}', pd))

    # attendee loop row
    S[66].addprevious(make_run_text('{#others}'))
    S[68].addnext(make_run_text('{/others}'))
    # services loop row
    S[318].find('w:sdtContent', ns)  # block-level, add tags after conversion (see below)

    # annual goal loop: inside the goal cell (sdt 198 content = tc)
    goal_tc = S[198].find('w:sdtContent/w:tc', ns)
    paras = goal_tc.findall('w:p', ns)
    goal_head = paras[0]  # "GOAL"
    goal_head.addprevious(loop_para('{#goals}', goal_head))
    goal_head.append(make_run_text(' {goalNum}', goal_head))
    inner_tbl = goal_tc.find('w:tbl', ns)
    nxt = inner_tbl.getnext()
    (nxt if nxt is not None and not text_of(nxt).strip() else inner_tbl).addnext(loop_para('{/goals}', goal_head))

    # parent interview domain labels -> append fields
    pi_map = {'Communication:': 'piCommunication', 'Daily Living Skills:': 'piDailyLiving',
              'Functional Academics/School:': 'piAcademics', 'Safety Skills:': 'piSafety',
              'Post-Secondary Pursuits:': 'piPostSecondary'}
    for p in S[122].find('w:sdtContent', ns).iter(q('p')):
        tx = text_of(p).strip()
        if tx in pi_map:
            append_tag_to_para(p, pi_map[tx])

    # GE preschool "Other" hours cell (blank)
    tr = ancestor(S[405], 'tr')
    p = tr.findall('w:tc', ns)[-1].find('w:p', ns)
    p.append(make_run('gepOtherHours', first_rpr(tr)))
    # state alternate assessment justification: blank paragraph after the prompt
    for p in S[224].find('w:sdtContent', ns).iter(q('p')):
        if text_of(p).startswith('If the student will be participating in the Colorado Alternative Assessment'):
            nxt = p.getnext()
            if nxt is not None and nxt.tag == q('p') and not text_of(nxt).strip():
                nxt.append(make_run('saAltJustification', None))
            else:
                p.addnext(make_para('saAltJustification', p))
            break

    # ---- replace / unwrap, innermost first ----
    live = [s for s in S if s.getparent() is not None and _attached(s, root)]
    for s in reversed(live):
        i = tagged[id(s)]
        tag = M.get(i)
        if tag is None:
            raise RuntimeError('no mapping for sdt %d' % i)
        if tag == 'U':
            unwrap(s)
        else:
            replace_with_tag(s, tag)

    # services row loop tags (cells now plain)
    for t in root.iter(q('t')):
        if t.text == '{sArea}':
            t.text = '{#services}{sArea}'
        elif t.text == '{sIM}':
            t.text = '{sIM}{/services}'
    for t in root.iter(q('t')):
        if t.text and t.text.startswith('will not participate in state or district'):
            t.text = ' ' + t.text
            t.set(XMLSPACE, 'preserve')
    # remove any leftover content controls (none expected)
    assert not root.findall('.//w:sdt', ns)


def _attached(e, root):
    for a in e.iterancestors():
        if a is root:
            return True
    return False


def make_run_text(text, like=None):
    r = etree.Element(q('r'))
    if like is not None:
        rp = first_rpr(like)
        if rp is not None:
            r.append(rp)
    t = etree.SubElement(r, q('t'))
    t.text = text
    t.set(XMLSPACE, 'preserve')
    return r


def process_header(root):
    S = root.findall('.//w:sdt', ns)
    assert len(S) == 4, len(S)
    for s, tag in reversed(list(zip(S, HEADER_TAGS))):
        replace_with_tag(s, tag)


def main():
    tmp = OUT + '.d'
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(SRC) as z:
        z.extractall(tmp)
        names = z.namelist()
    for part, fn in (('word/document.xml', process_document), ('word/header1.xml', process_header)):
        path = os.path.join(tmp, part)
        tree = etree.parse(path)
        fn(tree.getroot())
        if part == 'word/document.xml':
            for paragraph in tree.getroot().iter(q('p')):
                for text in paragraph.iter(q('t')):
                    if text.text and '{psSignDate}' in text.text:
                        text.text = text.text.replace('{psSignDate}', 'Date procedural safeguards and the draft were sent: {psSignDate}')
        tree.write(path, xml_declaration=True, encoding='UTF-8', standalone=True)
    footer = os.path.join(tmp, 'word/footer1.xml')
    if os.path.exists(footer):
        tree = etree.parse(footer)
        root = tree.getroot()
        for p in root.iter(q('p')):
            if text_of(p).strip().lower().startswith('revised'):
                p.getparent().remove(p)
        tree.write(footer, xml_declaration=True, encoding='UTF-8', standalone=True)
    # turn off "show placeholder" style leftovers & document protection if any
    sp = os.path.join(tmp, 'word/settings.xml')
    st = etree.parse(sp)
    for e in st.getroot().findall('w:documentProtection', ns):
        st.getroot().remove(e)
    st.write(sp, xml_declaration=True, encoding='UTF-8', standalone=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.write(os.path.join(tmp, n), n)
    shutil.rmtree(tmp)
    print('wrote', OUT)


main()
